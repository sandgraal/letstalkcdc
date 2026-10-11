#!/usr/bin/env node
// PreToolUse hook for the Bash tool: the mechanical half of the Autonomy
// Charter in docs/CONDUCTOR.md.
//
// The charter lets agents push `claude/*` branches and open PRs, and merge
// only through scripts/merge-pr.mjs. Everything else that touches shared
// state is denied here, by command shape, whatever the prompt says.
//
// Exit 0 = allow. Exit 2 = deny (stderr is shown to the model).
//
// FAIL CLOSED: an unparseable payload, an unparseable command, or any
// exception in this file is a deny. settings.json also registers this hook
// as `node ... || exit 2`, so a crash before this file even loads (syntax
// error, missing node) is a deny too.
//
// Limits (see docs/CONDUCTOR.md, "Honest limits"): this is a tokenizer, not
// a shell. It understands quoting, separators, substitutions, heredocs and
// the common wrappers, and it refuses anything it cannot see through
// (variable command names, unknown push flags, code from stdin). It cannot
// see inside scripts that are already on disk, aliases in a personal
// ~/.gitconfig, or symlink tricks. It is a guardrail, not a sandbox.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

class ParseError extends Error {}

/* ------------------------------------------------------------------ *
 * Tokenizer: command string -> flat list of simple commands.
 * Command substitutions, backticks, subshells, process substitutions and
 * heredoc bodies are parsed recursively; their commands are appended to the
 * same list so every command that could run is seen.
 * ------------------------------------------------------------------ */

const SPACE = new Set([" ", "\t"]);
const WORD_BREAK = new Set([
  " ",
  "\t",
  "\n",
  ";",
  "&",
  "|",
  "<",
  ">",
  "(",
  ")",
]);

/** @typedef {{ text: string, exp: boolean, glob: boolean, quoted: boolean, assign: boolean }} Word */

class Parser {
  constructor(src, ctx) {
    this.s = src;
    this.i = 0;
    this.ctx = ctx;
    this.heredocs = [];
    this.lastWordEnd = -1;
    this.sawSub = false;
  }

  newPipe() {
    return this.ctx.pipeCounter++;
  }

  parseTop() {
    this.parseSeq(null);
  }

  parseSeq(closer) {
    const { s } = this;
    let cur = [];
    let redirs = [];
    let pipe = this.newPipe();
    // A command may be only redirections (`> file`, `: > file`): keep it,
    // because it still truncates the file.
    const flush = () => {
      if (cur.length || redirs.length) {
        this.ctx.cmds.push({ argv: cur, pipe, redirs });
      }
      cur = [];
      redirs = [];
    };
    for (;;) {
      while (this.i < s.length && SPACE.has(s[this.i])) this.i++;
      if (this.i >= s.length) {
        if (closer) throw new ParseError("unterminated ( in command");
        flush();
        return;
      }
      const c = s[this.i];
      if (c === "\\" && s[this.i + 1] === "\n") {
        this.i += 2;
        continue;
      }
      if (c === "#") {
        while (this.i < s.length && s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "\n") {
        flush();
        this.i++;
        pipe = this.newPipe();
        this.readHeredocs();
        continue;
      }
      if (c === ";") {
        flush();
        this.i += s[this.i + 1] === ";" || s[this.i + 1] === "&" ? 2 : 1;
        pipe = this.newPipe();
        continue;
      }
      if (c === "&" && s[this.i + 1] !== ">") {
        flush();
        this.i += s[this.i + 1] === "&" ? 2 : 1;
        pipe = this.newPipe();
        continue;
      }
      if (c === "|") {
        flush();
        if (s[this.i + 1] === "|") {
          this.i += 2;
          pipe = this.newPipe();
        } else {
          this.i += s[this.i + 1] === "&" ? 2 : 1; // same pipeline
        }
        continue;
      }
      if (c === "(") {
        flush();
        this.i++;
        this.parseSeq(")");
        pipe = this.newPipe();
        continue;
      }
      if (c === ")") {
        if (closer === ")") {
          flush();
          this.i++;
          return;
        }
        throw new ParseError("unbalanced ) in command");
      }
      if (c === "<" || c === ">" || c === "&") {
        if ((c === "<" || c === ">") && s[this.i + 1] === "(") {
          this.i += 2;
          this.parseSeq(")");
          cur.push({
            text: "\0",
            exp: true,
            glob: false,
            quoted: false,
            assign: false,
            sub: true,
          });
          continue;
        }
        const m = /^(&>>|&>|<<<|<<-|<<|>>|>\||>&|<&|<>|>|<)/.exec(
          s.slice(this.i),
        );
        if (!m) throw new ParseError("unrecognised redirection");
        const last = cur[cur.length - 1];
        if (
          last &&
          !last.quoted &&
          /^\d+$/.test(last.text) &&
          this.lastWordEnd === this.i
        ) {
          cur.pop(); // fd number such as the 2 in 2>&1
        }
        this.i += m[0].length;
        while (this.i < s.length && SPACE.has(s[this.i])) this.i++;
        if (this.i >= s.length || WORD_BREAK.has(s[this.i])) {
          throw new ParseError("redirection without a target");
        }
        const target = this.readWord();
        redirs.push({ op: m[0], target });
        if (m[0] === "<<" || m[0] === "<<-") {
          this.heredocs.push({
            delim: target.text,
            quoted: target.quoted,
            strip: m[0] === "<<-",
          });
        }
        continue;
      }
      cur.push(this.readWord());
    }
  }

  readHeredocs() {
    const { s } = this;
    for (const h of this.heredocs.splice(0)) {
      let body = "";
      for (;;) {
        if (this.i >= s.length) break;
        let end = s.indexOf("\n", this.i);
        if (end < 0) end = s.length;
        const line = s.slice(this.i, end);
        this.i = Math.min(end + 1, s.length);
        const cmp = h.strip ? line.replace(/^\t+/, "") : line;
        if (cmp === h.delim) break;
        body += `${line}\n`;
      }
      if (!h.quoted) new Parser(body, this.ctx).scanDouble(null);
    }
  }

  /** Read one shell word starting at this.i (not at a break character). */
  readWord() {
    const { s } = this;
    let text = "";
    let exp = false;
    let glob = false;
    let quoted = false;
    let brace = false;
    // NAME= typed literally at the start makes this a VAR=value assignment,
    // even when the value is quoted (FOO='a b').
    const assign = /^[A-Za-z_][A-Za-z0-9_]*=/.test(
      s.slice(this.i, this.i + 256),
    );
    // An unquoted leading ~ expands to a home directory we cannot see.
    if (s[this.i] === "~") exp = true;
    this.sawSub = false;
    while (this.i < s.length) {
      const c = s[this.i];
      if (WORD_BREAK.has(c)) break;
      if (c === "\\") {
        if (s[this.i + 1] === undefined) {
          text += "\\";
          this.i++;
        } else if (s[this.i + 1] === "\n") {
          this.i += 2;
        } else {
          text += s[this.i + 1];
          quoted = true;
          this.i += 2;
        }
        continue;
      }
      if (c === "'") {
        const j = s.indexOf("'", this.i + 1);
        if (j < 0) throw new ParseError("unterminated ' quote");
        text += s.slice(this.i + 1, j);
        quoted = true;
        this.i = j + 1;
        continue;
      }
      if (c === '"') {
        this.i++;
        const r = this.scanDouble('"');
        text += r.text;
        exp ||= r.exp;
        quoted = true;
        continue;
      }
      if (c === "$" && s[this.i + 1] === "'") {
        const r = this.readAnsiC();
        text += r;
        quoted = true;
        continue;
      }
      if (c === "$" && s[this.i + 1] === '"') {
        this.i += 2;
        const r = this.scanDouble('"');
        text += r.text;
        exp ||= r.exp;
        quoted = true;
        continue;
      }
      if (c === "$") {
        exp = true;
        text += this.readDollar() || "$";
        continue;
      }
      if (c === "`") {
        this.readBacktick();
        exp = true;
        text += "\0";
        continue;
      }
      if (c === "*" || c === "?" || c === "[") glob = true;
      if (c === "{") brace = true;
      text += c;
      this.i++;
    }
    if (brace && text !== "{") glob = true;
    this.lastWordEnd = this.i;
    return { text, exp, glob, quoted, assign, sub: this.sawSub };
  }

  /** Body of a "..." string (or ${...}, or a heredoc when term is null). */
  scanDouble(term) {
    const { s } = this;
    let text = "";
    let exp = false;
    for (;;) {
      if (this.i >= s.length) {
        if (term !== null) throw new ParseError(`unterminated ${term}`);
        return { text, exp };
      }
      const c = s[this.i];
      if (term !== null && c === term) {
        this.i++;
        return { text, exp };
      }
      if (c === "\\") {
        const n = s[this.i + 1];
        if (n === undefined) {
          text += "\\";
          this.i++;
        } else if (n === "\n") {
          this.i += 2;
        } else if ('$`"\\'.includes(n) || n === term) {
          text += n;
          this.i += 2;
        } else {
          text += `\\${n}`;
          this.i += 2;
        }
        continue;
      }
      if (c === "$") {
        exp = true;
        text += this.readDollar() || "$";
        continue;
      }
      if (c === "`") {
        this.readBacktick();
        exp = true;
        text += "\0";
        continue;
      }
      text += c;
      this.i++;
    }
  }

  /** At a `$`. Consumes an expansion; returns "\0" or "" for a bare `$`. */
  readDollar() {
    const { s } = this;
    const n = s[this.i + 1];
    if (n === "(") {
      if (s[this.i + 2] === "(") {
        const end = this.findArithmeticEnd(this.i + 3);
        if (end >= 0) {
          const inner = s.slice(this.i + 3, end);
          new Parser(inner, this.ctx).parseTop();
          this.i = end + 2;
          return "\0";
        }
      }
      this.i += 2;
      this.parseSeq(")");
      this.sawSub = true; // after the nested words, which reset the flag
      return "\0";
    }
    if (n === "{") {
      this.i += 2;
      this.scanDouble("}");
      return "\0";
    }
    if (n !== undefined && /[A-Za-z_]/.test(n)) {
      this.i++;
      while (this.i < s.length && /[A-Za-z0-9_]/.test(s[this.i])) this.i++;
      return "\0";
    }
    if (n !== undefined && /[0-9@*#?!$-]/.test(n)) {
      this.i += 2;
      return "\0";
    }
    this.i++;
    return "";
  }

  /** Index of the first `)` of the `))` that closes `$((`, or -1. */
  findArithmeticEnd(from) {
    const { s } = this;
    let depth = 2;
    for (let j = from; j < s.length; j++) {
      const c = s[j];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return s[j - 1] === ")" ? j - 1 : -1;
      }
    }
    return -1;
  }

  readBacktick() {
    const { s } = this;
    let j = this.i + 1;
    let inner = "";
    for (;;) {
      if (j >= s.length) throw new ParseError("unterminated backtick");
      const c = s[j];
      if (c === "`") break;
      if (c === "\\" && j + 1 < s.length) {
        const n = s[j + 1];
        inner += "`$\\".includes(n) ? n : `\\${n}`;
        j += 2;
        continue;
      }
      inner += c;
      j++;
    }
    this.i = j + 1;
    this.sawSub = true;
    new Parser(inner, this.ctx).parseTop();
  }

  /** $'...' with the common escapes decoded (so $'\x67it' is "git"). */
  readAnsiC() {
    const { s } = this;
    let j = this.i + 2;
    let out = "";
    for (;;) {
      if (j >= s.length) throw new ParseError("unterminated $' quote");
      const c = s[j];
      if (c === "'") break;
      if (c !== "\\") {
        out += c;
        j++;
        continue;
      }
      const n = s[j + 1];
      const simple = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b" };
      if (n in simple) {
        out += simple[n];
        j += 2;
      } else if (n === "x") {
        const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(j + 2));
        if (!m) throw new ParseError("bad \\x escape");
        out += String.fromCharCode(parseInt(m[0], 16));
        j += 2 + m[0].length;
      } else if (n === "u" || n === "U") {
        const m = /^[0-9a-fA-F]{1,8}/.exec(s.slice(j + 2));
        if (!m) throw new ParseError("bad \\u escape");
        out += String.fromCodePoint(parseInt(m[0], 16));
        j += 2 + m[0].length;
      } else if (n !== undefined && /[0-7]/.test(n)) {
        const m = /^[0-7]{1,3}/.exec(s.slice(j + 1));
        out += String.fromCharCode(parseInt(m[0], 8));
        j += 1 + m[0].length;
      } else if (n === undefined) {
        throw new ParseError("unterminated $' quote");
      } else {
        out += n; // \\ \' \" \? and unknown escapes
        j += 2;
      }
    }
    this.i = j + 1;
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * Policy
 * ------------------------------------------------------------------ */

const deny = (reason) => ({ ok: false, reason });
const lit = (w) => w !== undefined && !w.exp && !w.glob;
const text = (w) => (w === undefined ? "" : w.text);

const WRAPPERS = new Set([
  "env",
  "command",
  "exec",
  "sudo",
  "doas",
  "nohup",
  "time",
  "nice",
  "ionice",
  "timeout",
  "xargs",
  "builtin",
  "stdbuf",
  "setsid",
  "watch",
  "caffeinate",
  "unbuffer",
]);
const RESERVED = new Set([
  "{",
  "}",
  "!",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
  "function",
  "coproc",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const INTERPRETERS = new Set([
  ...SHELLS,
  "node",
  "python",
  "python3",
  "perl",
  "ruby",
  "php",
]);
const DOWNLOADERS = new Set(["curl", "wget", "fetch"]);

const baseName = (w) => path.basename(text(w));

/** Drop leading VAR=value words and shell reserved words. */
function stripPrefix(argv) {
  let k = 0;
  for (;;) {
    const w = argv[k];
    if (!w) break;
    if (w.assign) {
      k++;
      continue;
    }
    if (!w.quoted && RESERVED.has(w.text)) {
      k++;
      continue;
    }
    break;
  }
  return argv.slice(k);
}

/* --- paths -------------------------------------------------------- */

const WORKTREE_RE = /(^|\/)\.claude\/worktrees\/([^/]+)(\/|$)/;

function safeRoots() {
  const roots = new Set(["/tmp", "/private/tmp", "/var/tmp"]);
  for (const r of [os.tmpdir(), "/tmp", process.env.TMPDIR]) {
    if (!r) continue;
    roots.add(path.resolve(r));
    try {
      roots.add(fs.realpathSync(r));
    } catch {
      /* not present */
    }
  }
  return [...roots];
}

/** Is `p` (already absolute and normalised) inside a safe deletion area? */
function underSafeArea(p) {
  const wt = WORKTREE_RE.exec(p);
  if (wt && !/[*?[{]/.test(wt[2])) return true;
  for (const root of safeRoots()) {
    if (p.startsWith(`${root}/`)) {
      const first = p.slice(root.length + 1).split("/")[0];
      if (first && !/[*?[{]/.test(first)) return true;
    }
  }
  return false;
}

function rmTargetIsSafe(w, ctx) {
  if (w.exp || w.text.includes("{}")) return false; // {} is find's match
  if (ctx.cdSeen && !path.isAbsolute(w.text)) return false;
  const abs = path.resolve(ctx.cwd, w.text);
  if (!underSafeArea(abs)) return false;
  try {
    const real = fs.realpathSync(abs);
    if (!underSafeArea(real)) return false;
  } catch {
    /* does not exist yet: the lexical check stands */
  }
  return true;
}

/* --- self-protection: the guards, the live config, git hooks -------- */

// A command that can write to any of these is denied, whatever it is:
//   .claude/ (settings, hooks, scripts, agents: anything outside a worktree)
//   .git/hooks, .git/config (what runs on every commit and push)
// Reading is fine, and so is anything under .claude/worktrees/<name>/ (a
// branch being written in its own worktree is how a maintainer-merged PR
// changes these files).

const WRITE_REDIRS = new Set([">", ">>", ">|", "&>", "&>>", "<>", ">&"]);
const BENIGN_SINKS = new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
]);

const isBenignSink = (w) => !w.exp && !w.glob && BENIGN_SINKS.has(w.text);

function isWriteRedirect(r) {
  if (!WRITE_REDIRS.has(r.op)) return false;
  // `2>&1` and `>&-` duplicate or close a descriptor; `>&file` writes a file.
  if (r.op === ">&" && !r.target.exp && /^(\d+|-)$/.test(r.target.text)) {
    return false;
  }
  return true;
}

/** `p` is absolute and normalised. Is it a place only the maintainer writes? */
function classifyAbs(p) {
  const comps = p.toLowerCase().split("/").filter(Boolean);
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c === ".git") {
      const n = comps[i + 1];
      if (
        [
          "hooks",
          "config",
          "config.worktree",
          "info",
          "refs",
          "packed-refs",
        ].includes(n)
      ) {
        return true;
      }
      if (n === "worktrees" && (comps[i + 3] ?? "").startsWith("config")) {
        return true;
      }
    }
    if (c === ".claude") {
      const name = comps[i + 2];
      if (comps[i + 1] === "worktrees" && name && !/[*?[{]/.test(name)) {
        return false; // a worktree: the branch being written
      }
      return true;
    }
  }
  return false;
}

/** Resolve symlinks (also dangling ones) without requiring the path to exist. */
function realish(input) {
  let pending = path.resolve(input).split("/").filter(Boolean);
  let acc = "/";
  let hops = 0;
  while (pending.length > 0) {
    const part = pending.shift();
    const next = path.join(acc, part);
    let st;
    try {
      st = fs.lstatSync(next);
    } catch {
      acc = next; // does not exist (yet): keep the rest as written
      continue;
    }
    if (st.isSymbolicLink()) {
      hops += 1;
      if (hops > 40) return path.resolve(input);
      const abs = path.resolve(acc, fs.readlinkSync(next));
      pending = abs.split("/").filter(Boolean).concat(pending);
      acc = "/";
    } else {
      acc = next;
    }
  }
  return acc;
}

const isProtectedAbs = (p) => classifyAbs(p) || classifyAbs(realish(p));

const CANDIDATE_BREAK = /[\s'"=:,;()<>|&`$\0{}]+/;

/** Path-like pieces of a word: `--output=.claude/x` yields `.claude/x`. */
function pathCandidates(t) {
  const out = [];
  for (const piece of t.split(CANDIDATE_BREAK)) {
    if (!piece) continue;
    out.push(piece);
    // `-o.claude/x`: a flag glued to a path
    for (const re of [/\.claude(?=\/|$)/, /\.git(?=\/(hooks|config|info))/]) {
      const m = re.exec(piece);
      if (m && m.index > 0) out.push(piece.slice(m.index));
    }
  }
  return out;
}

/** Does this word name (or glob into) a protected path from any of `cwds`? */
function touchesProtected(t, cwds) {
  for (const c of pathCandidates(t)) {
    if (path.isAbsolute(c)) {
      if (isProtectedAbs(path.normalize(c))) return true;
      continue;
    }
    for (const cwd of cwds) {
      if (cwd === null) {
        // unknown directory: judge the path on its own, and refuse `..`
        if (c.split("/").includes("..")) return true;
        if (classifyAbs(path.posix.normalize(`/${c}`))) return true;
      } else if (isProtectedAbs(path.resolve(cwd, c))) {
        return true;
      }
    }
  }
  return false;
}

const RO_HEADS = new Set([
  "cat",
  "rg",
  "grep",
  "egrep",
  "fgrep",
  "ls",
  "head",
  "tail",
  "wc",
  "stat",
  "file",
  "diff",
  "jq",
  "echo",
  "printf",
  "pwd",
  "true",
  "test",
  "[",
  "[[",
  "shasum",
  "sha256sum",
  "basename",
  "dirname",
  "realpath",
  "readlink",
]);
// Output-producing git subcommands (checked for --output / -o below).
const GIT_READ = new Set([
  "diff",
  "log",
  "show",
  "status",
  "ls-files",
  "ls-tree",
  "cat-file",
  "rev-parse",
  "blame",
  "grep",
  "check-ignore",
  "shortlog",
  "describe",
  "rev-list",
  "show-ref",
  "for-each-ref",
]);
// These stage or record paths without writing the files themselves.
const GIT_INDEX_ONLY = new Set(["add", "commit"]);
const FIND_WRITES = new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);

/** Subcommand and the `-C` directories of a git command line. */
function gitGlobals(argv) {
  let k = 1;
  const dirs = [];
  while (k < argv.length) {
    const t = argv[k].text;
    if (!t.startsWith("-")) break;
    const [name] = t.split("=");
    if (GIT_VALUE_OPTS.has(name)) {
      if (t.includes("=") && name.startsWith("--")) {
        k++;
        continue;
      }
      if (name === "-C" && argv[k + 1]) dirs.push(argv[k + 1]);
      k += 2;
      continue;
    }
    k++;
  }
  return { sub: argv[k]?.text ?? null, rest: argv.slice(k + 1), dirs };
}

const writesOutputFlag = (a) =>
  a === "-o" ||
  (a.startsWith("-o") && !a.startsWith("--")) ||
  prefixOf(a, "--output", 4) ||
  prefixOf(a, "--output-file", 4);

function isReadOnlyForm(argv, base, g) {
  const args = argv.slice(1).map((w) => w.text);
  if (base === "find") return !args.some((a) => FIND_WRITES.has(a));
  if (base === "sort") {
    return !args.some(
      (a) =>
        /^-[^-]*o/.test(a) ||
        prefixOf(a, "--output", 4) ||
        prefixOf(a, "--compress-program", 4),
    );
  }
  if (RO_HEADS.has(base)) return true;
  if (base === "git" && g.sub) {
    if (GIT_INDEX_ONLY.has(g.sub)) return true;
    if (GIT_READ.has(g.sub))
      return !g.rest.some((w) => writesOutputFlag(w.text));
    return false;
  }
  if (base === "npx" || base === "prettier") {
    // `prettier --check` reads; `--write` does not.
    const isPrettier = base === "prettier" || args[0] === "prettier";
    return (
      isPrettier &&
      args.some((a) =>
        ["--check", "-c", "--list-different", "-l"].includes(a),
      ) &&
      !args.some((a) => ["--write", "-w"].includes(a))
    );
  }
  return false;
}

const PROTECT_HELP =
  "The guard hooks, .claude/ config and git hooks/config are the maintainer's: " +
  "a command that can write them is denied (reading is fine). Change them on a " +
  "branch in a worktree (.claude/worktrees/<name>) and let the maintainer merge " +
  "(docs/CONDUCTOR.md, Honest limits).";

const show = (s) => s.replace(/\0/g, "$…");

function checkProtection(rawArgv, argv, redirs, ctx) {
  const base = argv.length ? baseName(argv[0]) : "";
  let cwds = ctx.cwds;
  let g = { sub: null, rest: [], dirs: [] };
  if (base === "git") {
    g = gitGlobals(argv);
    for (const d of g.dirs) {
      cwds = cwds.map((c) =>
        c === null || d.exp ? null : path.resolve(c, d.text),
      );
    }
  }

  let fileRedirect = false;
  for (const r of redirs) {
    if (!isWriteRedirect(r) || isBenignSink(r.target)) continue;
    fileRedirect = true;
    const t = r.target;
    if (t.exp || t.glob) {
      return deny(
        `Blocked: output redirection (${r.op}) to "${show(t.text)}", a path built from a variable, glob or substitution, so it cannot be checked against the protected files. Redirect to a literal path. ${PROTECT_HELP}`,
      );
    }
    if (touchesProtected(t.text, ctx.cwds)) {
      return deny(
        `Blocked: output redirection (${r.op}) to ${t.text}. ${PROTECT_HELP}`,
      );
    }
  }

  const readOnly = isReadOnlyForm(argv, base, g);
  const prose = ["git", "gh", "echo", "printf"].includes(base);
  const reparsed = SHELLS.has(base) || ["eval", "env", "watch"].includes(base);
  let hit = null;
  for (const w of rawArgv) {
    const t = w.text;
    // Prose (a commit message, a PR body) and strings that are parsed again
    // as commands are judged elsewhere; real path operands have no spaces.
    if ((prose || reparsed) && /\s/.test(t)) continue;
    if (
      (base === "bash" || base === "sh") &&
      t === ".claude/scripts/check-merged-prs.sh"
    ) {
      continue;
    }
    if (touchesProtected(t, cwds)) {
      hit = t;
      break;
    }
    if (!readOnly && !prose && /core\.hookspath/i.test(t)) {
      hit = t;
      break;
    }
  }
  if (hit !== null && !readOnly) {
    return deny(
      `Blocked: \`${show(base || "(redirection)")}\` names ${show(hit)}, and it is not a read-only command. ${PROTECT_HELP}`,
    );
  }
  if (hit !== null && fileRedirect) {
    return deny(
      `Blocked: a command reading ${show(hit)} with an output redirection. ${PROTECT_HELP}`,
    );
  }

  if (
    !readOnly &&
    !["cd", "pushd", "popd"].includes(base) &&
    ctx.cwds.some((c) => c !== null && isProtectedAbs(c))
  ) {
    return deny(
      `Blocked: the working directory is inside a protected area, and \`${show(base)}\` is not a read-only command. ${PROTECT_HELP}`,
    );
  }
  return null;
}

/* --- git ---------------------------------------------------------- */

const GIT_VALUE_OPTS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--super-prefix",
  "--config-env",
  "--attr-source",
]);
const RISKY_GIT_CONFIG =
  /^(alias\.|core\.(hookspath|sshcommand|fsmonitor|editor|pager|askpass|gitproxy)|url\.|remote\.|credential|include|includeif|protocol\.|filter\.|gpg\.|commit\.gpgsign|clean\.requireforce|push\.|receive\.|http\.|diff\..*\.(command|textconv)|sequence\.editor)/i;

const PUSH_BOOL_LONG = new Set([
  "--set-upstream",
  "--quiet",
  "--verbose",
  "--dry-run",
  "--porcelain",
  "--progress",
  "--no-progress",
  "--atomic",
  "--no-atomic",
  "--thin",
  "--no-thin",
  "--verify",
  "--ipv4",
  "--ipv6",
]);
const PUSH_BOOL_SHORT = new Set(["u", "q", "v", "n", "4", "6"]);
// Every segment starts with a letter, digit or underscore (git refuses a
// leading dot, and a leading dash would read as an option) and does not end
// in a dot. Nothing outside [A-Za-z0-9._-] is a branch an agent may push.
const BRANCH_RE = /^claude(\/[A-Za-z0-9_]([A-Za-z0-9._-]*[A-Za-z0-9_-])?)+$/;

const PUSH_HELP =
  "Agents may push only `claude/*` branches by explicit name: " +
  "`git push [-u] origin claude/<name>`. Main, force, delete, mirror, tags " +
  "and HEAD are denied. Merging goes through `node scripts/merge-pr.mjs <n> " +
  "--execute` (docs/CONDUCTOR.md, Autonomy charter).";

function checkGitPush(args) {
  const positional = [];
  let afterDashes = false;
  for (let k = 0; k < args.length; k++) {
    const w = args[k];
    const t = w.text;
    if (w.exp || w.glob) {
      return deny(
        `Blocked: \`git push\` argument "${t.replace(/\0/g, "$…")}" is built from a variable, glob or substitution, so its target cannot be checked. ${PUSH_HELP}`,
      );
    }
    if (afterDashes || !t.startsWith("-")) {
      positional.push(t);
      continue;
    }
    if (t === "--") {
      afterDashes = true;
      continue;
    }
    if (t.startsWith("--")) {
      const name = t.split("=")[0];
      if (prefixOf(t, "--no-verify", 8)) {
        return deny(
          `Blocked: \`git push --no-verify\` skips the pre-push hook. ${PUSH_HELP}`,
        );
      }
      if (PUSH_BOOL_LONG.has(name) && !t.includes("=")) continue;
      return deny(
        `Blocked: \`git push ${t}\` is not an allowed push option (force, delete, mirror, all, tags, prune, abbreviations and unknown flags are denied). ${PUSH_HELP}`,
      );
    }
    const letters = t.slice(1);
    if (letters && [...letters].every((l) => PUSH_BOOL_SHORT.has(l))) continue;
    return deny(
      `Blocked: \`git push ${t}\` is not an allowed push option (-f, -d and unknown flags are denied). ${PUSH_HELP}`,
    );
  }
  if (positional.length < 2) {
    return deny(
      `Blocked: \`git push\` needs an explicit remote and \`claude/*\` branch (a bare push or \`HEAD\` could resolve to main). ${PUSH_HELP}`,
    );
  }
  const [remote, ...refspecs] = positional;
  if (!/^[A-Za-z0-9._-]+$/.test(remote)) {
    return deny(
      `Blocked: \`git push\` remote "${remote}" is not a plain remote name (URLs and paths are denied). ${PUSH_HELP}`,
    );
  }
  for (const spec of refspecs) {
    const segments = spec.split(/[/:]/);
    if (segments.some((p) => p === "main" || p === "master")) {
      return deny(
        `Blocked: \`git push\` names main/master ("${spec}"). ${PUSH_HELP}`,
      );
    }
    if (spec.startsWith("+")) {
      return deny(`Blocked: "${spec}" is a forced refspec. ${PUSH_HELP}`);
    }
    const parts = spec.split(":");
    const valid = (b) =>
      BRANCH_RE.test(b) &&
      !b.includes("..") &&
      !b.split("/").some((seg) => seg.endsWith(".lock"));
    if (parts.length === 1 && valid(parts[0])) continue;
    if (parts.length === 2 && parts[0] === parts[1] && valid(parts[0]))
      continue;
    return deny(
      `Blocked: refspec "${spec}" is not a single \`claude/*\` branch pushed to the same name. ${PUSH_HELP}`,
    );
  }
  return null;
}

/** Cluster of short flags: does it contain `letter` before a value-taking one? */
function clusterHas(arg, letter, valueLetters) {
  if (!/^-[^-]/.test(arg)) return false;
  for (const l of arg.slice(1)) {
    if (l === letter) return true;
    if (valueLetters.includes(l)) return false;
  }
  return false;
}

/** Git accepts unambiguous prefixes of long options; match them. */
const prefixOf = (arg, full, min) => {
  const name = arg.split("=")[0];
  return arg.startsWith("--") && name.length >= min && full.startsWith(name);
};

/** `git config`: reads are fine; any write, and `-f/--file`, are not. */
function checkGitConfig(args) {
  const WRITE_FLAGS = new Set([
    "--add",
    "--unset",
    "--unset-all",
    "--replace-all",
    "--rename-section",
    "--remove-section",
    "--edit",
    "--set",
  ]);
  const readFlags = [
    "--get",
    "--get-all",
    "--get-regexp",
    "--get-urlmatch",
    "--list",
    "--show-origin",
    "--show-scope",
    "--name-only",
  ];
  const deniedConfig = (what) =>
    deny(
      `Blocked: \`git config ${what}\` writes git configuration (hooks, aliases, remotes, signing, identity). That is a maintainer change; reading with \`git config --get <key>\` is fine.`,
    );
  let positional = 0;
  let read = false;
  let write = false;
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t === "--") continue;
    if (t.startsWith("--")) {
      const name = t.split("=")[0];
      if (prefixOf(t, "--file", 6)) return deniedConfig(t);
      if (WRITE_FLAGS.has(name)) write = true;
      else if (readFlags.some((f) => f === name || prefixOf(t, f, 6))) {
        read = true;
      } else if (["--type", "--default", "--blob"].includes(name)) {
        if (!t.includes("=")) k++;
      }
      continue;
    }
    if (t.startsWith("-") && t.length > 1) {
      if (/f/.test(t)) return deniedConfig(t);
      if (/e/.test(t)) write = true;
      if (/l/.test(t)) read = true;
      if (/t/.test(t) && t.endsWith("t")) k++;
      continue;
    }
    positional++;
  }
  if (write || (!read && positional >= 2)) return deniedConfig("(write form)");
  return null;
}

/** fetch / pull / ls-remote / clone / archive: no helper programs. */
function checkGitTransport(name, args) {
  for (const a of args) {
    const t = a.text;
    if (t === "--") break;
    const flag = t.startsWith("--")
      ? ["--upload-pack", "--receive-pack", "--exec", "--upload-archive"].some(
          (f) => prefixOf(t, f, 5),
        )
      : t.startsWith("-") && /^-[A-Za-z0-9]*u/.test(t);
    if (/:\+?(refs\/)?remotes\//.test(t)) {
      return deny(
        `Blocked: \`git ${name} ${t}\` writes a remote-tracking ref by hand. origin/main is what the merge-script gate compares against; \`git fetch origin\` updates it honestly.`,
      );
    }
    if (flag || /^(ext|fd)::/.test(t)) {
      return deny(
        `Blocked: \`git ${name} ${t}\` names a program git would run (--upload-pack, -u, --receive-pack, --exec) or an \`ext::\` transport. That is arbitrary command execution.`,
      );
    }
  }
  return null;
}

function checkGit(argv, ctx) {
  let k = 1;
  let dir = null;
  while (k < argv.length) {
    const w = argv[k];
    const t = w.text;
    if (!t.startsWith("-")) break;
    const [name] = t.split("=");
    if (["--git-dir", "--work-tree", "--exec-path"].includes(name)) {
      return deny(
        `Blocked: \`git ${name}\` points git at a different repository, work tree or helper directory, so the checks on the command cannot be trusted.`,
      );
    }
    if (GIT_VALUE_OPTS.has(name)) {
      let val;
      if (t.includes("=") && name.startsWith("--"))
        val = t.slice(name.length + 1);
      else {
        val = text(argv[k + 1]);
        k++;
      }
      if (name === "-c" || name === "--config-env") {
        const key = val.split("=")[0];
        if (RISKY_GIT_CONFIG.test(key) || argv[k]?.exp) {
          return deny(
            `Blocked: \`git ${name} ${key}=…\` can swap hooks, aliases, remotes or signing. Set it in the repo config through a reviewed change, not inline.`,
          );
        }
      }
      if (name === "-C") dir = argv[k];
      k++;
      continue;
    }
    k++;
  }
  const sub = argv[k];
  if (!sub) return null;
  if (!lit(sub)) {
    return deny(
      "Blocked: the git subcommand is built from a variable or glob, so it cannot be checked.",
    );
  }
  const args = argv.slice(k + 1);
  const name = sub.text;

  if (name === "push") return checkGitPush(args);

  if (name === "update-ref" || name === "symbolic-ref") {
    return deny(
      `Blocked: \`git ${name}\` moves refs by hand (it could make origin/main say whatever the merge-script gate should compare against). \`git fetch\` updates remote-tracking refs honestly.`,
    );
  }

  if (name === "send-pack") {
    return deny(
      "Blocked: `git send-pack` pushes around the `git push` policy. " +
        PUSH_HELP,
    );
  }

  if (name === "commit") {
    const longValue = new Set([
      "--message",
      "--file",
      "--author",
      "--date",
      "--reuse-message",
      "--reedit-message",
      "--template",
      "--fixup",
      "--squash",
      "--cleanup",
      "--trailer",
    ]);
    for (let j = 0; j < args.length; j++) {
      const t = args[j].text;
      if (t === "--") break;
      if (t.startsWith("--")) {
        if (prefixOf(t, "--no-verify", 8)) {
          return deny(
            "Blocked: `git commit --no-verify` skips the repo's hooks. Fix what the hook reports instead.",
          );
        }
        if (prefixOf(t, "--no-gpg-sign", 8)) {
          return deny(
            "Blocked: `git commit --no-gpg-sign` is banned by CLAUDE.md.",
          );
        }
        if (longValue.has(t)) j++; // its value is not a flag
        continue;
      }
      if (!t.startsWith("-")) continue;
      for (let c = 1; c < t.length; c++) {
        const l = t[c];
        if (l === "n") {
          return deny(
            "Blocked: `git commit -n` is `--no-verify`; it skips the repo's hooks. Fix what the hook reports instead.",
          );
        }
        if ("mFCct".includes(l)) {
          if (c === t.length - 1) j++; // value is the next argument
          break;
        }
        if (l === "u" || l === "S") break; // optional attached value
      }
    }
    return null;
  }

  // --no-verify on anything else (merge, rebase, am, cherry-pick ...)
  for (const a of args) {
    if (a.text === "--") break;
    if (prefixOf(a.text, "--no-verify", 8)) {
      return deny(
        `Blocked: \`git ${name} --no-verify\` skips the repo's hooks. Fix what the hook reports instead.`,
      );
    }
  }

  if (name === "reset") {
    for (const a of args) {
      if (a.text === "--") break;
      if (prefixOf(a.text, "--hard", 4)) {
        return deny(
          "Blocked: `git reset --hard` discards work with no undo. Use `git switch`, `git restore <path>` or a new commit.",
        );
      }
    }
    return null;
  }

  if (name === "config") return checkGitConfig(args);

  if (name === "remote") {
    const sub0 = args.find((a) => !a.text.startsWith("-"));
    if (
      sub0 &&
      (!lit(sub0) ||
        [
          "add",
          "set-url",
          "rename",
          "remove",
          "rm",
          "set-head",
          "set-branches",
        ].includes(sub0.text))
    ) {
      return deny(
        `Blocked: \`git remote ${show(sub0.text)}\` rewires where pushes and fetches go (and so what the push checks mean). That is the maintainer's.`,
      );
    }
    return null;
  }

  if (["fetch", "pull", "ls-remote", "clone", "archive"].includes(name)) {
    const r = checkGitTransport(name, args);
    if (r) return r;
  }

  if (name === "clean") {
    let force = false;
    let pathspec = false;
    let afterDashes = false;
    for (let j = 0; j < args.length; j++) {
      const t = args[j].text;
      if (afterDashes) pathspec = pathspec || t.includes("..");
      else if (t === "--") afterDashes = true;
      else if (t.startsWith("--")) {
        if (prefixOf(t, "--force", 4)) force = true;
      } else if (t.startsWith("-")) {
        if (clusterHas(t, "f", "e")) force = true;
        if (clusterHas(t, "e", "")) j++;
      } else if (t.includes("..")) pathspec = true;
    }
    if (!force) return null;
    let eff = ctx.cdSeen ? null : ctx.cwd;
    if (dir) {
      if (dir.exp) eff = null;
      else if (path.isAbsolute(dir.text)) eff = path.resolve(dir.text);
      else if (eff) eff = path.resolve(eff, dir.text);
    }
    if (eff && !pathspec && WORKTREE_RE.test(`${eff}/`)) return null;
    return deny(
      "Blocked: `git clean -f` deletes untracked files for good. It is allowed only inside a `.claude/worktrees/<name>` checkout, with no `..` pathspec.",
    );
  }

  return null;
}

/* --- gh ----------------------------------------------------------- */

const GH_API_VALUE_SHORT = "qtpHXfF";

function checkGhApi(args) {
  const reasonWrite = (flag) =>
    deny(
      `Blocked: \`gh api\` with ${flag} writes to GitHub. Agents may only read through \`gh api\`; use \`gh pr create|comment|update-branch\` or \`gh issue create|comment\`, and merge through scripts/merge-pr.mjs.`,
    );
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t === "--") break;
    if (t.startsWith("--")) {
      const [name, ...rest] = t.split("=");
      const inline = rest.length ? rest.join("=") : null;
      if (name === "--method") {
        const v = inline ?? text(args[k + 1]);
        if (!/^GET$/i.test(v) || args[k + 1]?.exp)
          return reasonWrite(`--method ${v}`);
        if (inline === null) k++;
        continue;
      }
      if (/^--(field|raw-field|input)$/.test(name)) return reasonWrite(name);
      if (name === "--header") {
        const v = inline ?? text(args[k + 1]);
        if (/method-override/i.test(v))
          return reasonWrite("a method-override header");
        if (inline === null) k++;
      }
      if (
        /^--(jq|template|preview|hostname|cache)$/.test(name) &&
        inline === null
      )
        k++;
      continue;
    }
    if (t.startsWith("-") && t.length > 1) {
      const letters = t.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const l = letters[j];
        if (l === "f" || l === "F") return reasonWrite(`-${l}`);
        if (l === "X") {
          const attached = letters.slice(j + 1);
          const v = attached || text(args[k + 1]);
          if (!/^GET$/i.test(v) || (!attached && args[k + 1]?.exp))
            return reasonWrite(`-X ${v}`);
          if (!attached) k++;
          break;
        }
        if (GH_API_VALUE_SHORT.includes(l)) {
          if (l === "H") {
            const attached = letters.slice(j + 1);
            const v = attached || text(args[k + 1]);
            if (/method-override/i.test(v))
              return reasonWrite("a method-override header");
          }
          if (j === letters.length - 1) k++;
          break;
        }
      }
    }
  }
  return null;
}

const GH_REPO_OK = "sandgraal/letstalkcdc";
const SECRET_NAME =
  /^(id_(rsa|dsa|ecdsa|ed25519)|credentials?|\.env.*|\.npmrc|\.netrc)|\.(pem|key|p12|pfx|jks|keystore|env)$/i;

/** Is `p` (absolute) somewhere a PR body may be read from? */
function bodyFilePathOk(p, cwd) {
  const roots = safeRoots();
  const wt = WORKTREE_RE.exec(`${cwd}/`);
  if (wt) roots.push(cwd.slice(0, wt.index + wt[0].length - 1));
  else if (cwd !== "/" && cwd !== os.homedir()) roots.push(cwd);
  for (const cand of [p, realish(p)]) {
    const root = roots
      .flatMap((r) => [r, realish(r)])
      .find((r) => cand.startsWith(`${r}/`));
    if (!root) return false;
    for (const comp of cand.slice(root.length + 1).split("/")) {
      if (comp.startsWith(".") || SECRET_NAME.test(comp)) return false;
    }
  }
  return true;
}

function checkGhFileArg(w, flag, ctx) {
  const why =
    "A PR or issue body may be read only from a file inside the current worktree or the OS temp directory that is not a dotfile, key, credential or env file.";
  if (!w || w.exp || w.glob) {
    return deny(
      `Blocked: \`gh ... ${flag}\` with a path built from a variable, glob or substitution, so it cannot be checked. ${why}`,
    );
  }
  if (w.text === "-") {
    return deny(
      `Blocked: \`gh ... ${flag} -\` reads the body from stdin, so its source cannot be checked. Write the body to a file first. ${why}`,
    );
  }
  for (const cwd of ctx.cwds) {
    if (cwd === null || !bodyFilePathOk(path.resolve(cwd, w.text), cwd)) {
      return deny(
        `Blocked: \`gh ... ${flag} ${w.text}\` would send that file's contents to GitHub. ${why}`,
      );
    }
  }
  return null;
}

/** gh pr|issue create|comment|edit|update-branch: where, from what, how. */
function checkGhWrite(group, sub, args, ctx) {
  for (let k = 0; k < args.length; k++) {
    const w = args[k];
    const t = w.text;
    if (t === "--") break;
    if (w.sub && sub !== "update-branch") {
      return deny(
        `Blocked: \`gh ${group} ${sub}\` with a command or process substitution in its arguments (\`$(...)\`, backticks, \`<(...)\`) can read any file into the body. Write the text to a file in the temp directory and pass \`--body-file\`.`,
      );
    }
    let repo;
    if (t === "-R" || t === "--repo") {
      repo = args[k + 1];
      k++;
    } else if (t.startsWith("--repo=")) {
      repo = { ...w, text: t.slice(7) };
    } else if (/^-R./.test(t) && !t.startsWith("--")) {
      repo = { ...w, text: t.slice(2).replace(/^=/, "") };
    }
    if (repo !== undefined && (repo.exp || repo.text !== GH_REPO_OK)) {
      return deny(
        `Blocked: \`gh ${group} ${sub}\` aimed at "${show(text(repo))}". Agents may act only on ${GH_REPO_OK}.`,
      );
    }
    if (sub === "update-branch" && t === "--rebase") {
      return deny(
        "Blocked: `gh pr update-branch --rebase` rewrites the PR branch's history. Use the default merge update.",
      );
    }
    if (sub === "update-branch") continue;
    for (const flag of ["--body-file", "--template"]) {
      if (t === flag) {
        const r = checkGhFileArg(args[k + 1], flag, ctx);
        if (r) return r;
        k++;
      } else if (t.startsWith(`${flag}=`)) {
        const r = checkGhFileArg(
          { ...w, text: t.slice(flag.length + 1) },
          flag,
          ctx,
        );
        if (r) return r;
      }
    }
    if (t === "-F" || t === "-T") {
      const r = checkGhFileArg(args[k + 1], t, ctx);
      if (r) return r;
      k++;
    } else if (/^-[FT]./.test(t)) {
      const r = checkGhFileArg(
        { ...w, text: t.slice(2).replace(/^=/, "") },
        t.slice(0, 2),
        ctx,
      );
      if (r) return r;
    }
  }
  return null;
}

function checkGh(argv, ctx) {
  const args = argv.slice(1);
  const pos = [];
  const rest = [];
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t.startsWith("-")) {
      if ((t === "-R" || t === "--repo") && k + 1 < args.length) k++;
      continue;
    }
    pos.push(args[k]);
    rest.push(k);
  }
  const g = text(pos[0]);
  const s = text(pos[1]);
  if (pos[0] && !lit(pos[0]))
    return deny("Blocked: the gh command is built from a variable or glob.");
  if (g === "pr" && (s === "merge" || (pos[1] && !lit(pos[1])))) {
    return deny(
      "Blocked: `gh pr merge` is denied. Merge only through `node scripts/merge-pr.mjs <n> --execute` (docs/CONDUCTOR.md, Autonomy charter).",
    );
  }
  if (g === "api") return checkGhApi(args.slice(rest[0] + 1));
  if (
    (g === "pr" &&
      ["create", "comment", "edit", "update-branch"].includes(s)) ||
    (g === "issue" && ["create", "comment", "edit"].includes(s))
  ) {
    const r = checkGhWrite(g, s, args, ctx);
    if (r) return r;
  }
  if (
    g === "repo" &&
    ["edit", "delete", "archive", "unarchive", "rename"].includes(s)
  ) {
    return deny(
      `Blocked: \`gh repo ${s}\` changes repository settings. That is the maintainer's.`,
    );
  }
  if (
    (g === "secret" || g === "variable") &&
    ["set", "delete", "remove"].includes(s)
  ) {
    return deny(
      `Blocked: \`gh ${g} ${s}\` changes secrets or variables. That is the maintainer's.`,
    );
  }
  if (g === "ruleset" || g === "rulesets") {
    return deny(
      "Blocked: `gh ruleset` is repository governance. That is the maintainer's.",
    );
  }
  if (g === "alias" && s !== "list") {
    return deny(
      "Blocked: `gh alias set|import|delete` could define a shortcut around the merge guard.",
    );
  }
  if (g === "extension" || g === "extensions") {
    return deny("Blocked: `gh extension` installs and runs third-party code.");
  }
  if (g === "auth" && s !== "status") {
    return deny(
      "Blocked: `gh auth` changes the logged-in account. External accounts are the maintainer's.",
    );
  }
  return null;
}

/* --- node / shells / rm / find ------------------------------------ */

const NODE_VALUE_OPTS = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "-C",
  "--conditions",
  "--env-file",
  "--input-type",
  "--title",
  "--inspect-port",
]);

/* --- the merge script runs only from an unmodified origin/main ------ */

const MERGE_SCRIPT = "scripts/merge-pr.mjs";
// The full ref name: a local branch or tag called `origin/main` would win
// over the short name.
const MAIN_REF = "refs/remotes/origin/main";
const MERGE_HELP =
  "merge-pr.mjs or package.json differs from origin/main: run it from an up-to-date main checkout";

/** Run git with a clean environment. Fails closed: `ok` only on exit 0. */
function git(cwd, args) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  const r = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 5000,
  });
  return {
    ok: !r.error && r.status === 0,
    out: typeof r.stdout === "string" ? r.stdout.trim() : "",
  };
}

/**
 * `script` is the path given to node (or null for `npm run merge-pr`).
 * Allowed only if scripts/merge-pr.mjs and package.json in the working tree
 * are byte-identical to origin/main. Skipped only when there is nothing to
 * run (the script is not in the tree at all).
 */
function mergeGate(script, ctx) {
  for (const cwd of ctx.cwds) {
    if (cwd === null) {
      return deny(
        `Blocked: the merge script was started from a directory that cannot be determined. ${MERGE_HELP}.`,
      );
    }
    let dir;
    let file = null;
    if (script !== null) {
      file = path.resolve(cwd, script);
      if (!fs.existsSync(file)) continue;
      dir = path.dirname(file);
    } else {
      let d = cwd;
      while (!fs.existsSync(path.join(d, "package.json"))) {
        const up = path.dirname(d);
        if (up === d) break;
        d = up;
      }
      if (!fs.existsSync(path.join(d, "package.json"))) continue;
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8"));
      } catch {
        pkg = { scripts: { "merge-pr": "unreadable package.json" } };
      }
      const defined = pkg?.scripts?.["merge-pr"] !== undefined;
      if (!defined && !fs.existsSync(path.join(d, MERGE_SCRIPT))) continue;
      dir = d;
    }
    const top = git(dir, ["rev-parse", "--show-toplevel"]);
    const expected = top.ok ? path.join(top.out, MERGE_SCRIPT) : null;
    const same = (a, b) => {
      try {
        return fs.realpathSync(a) === fs.realpathSync(b);
      } catch {
        return false;
      }
    };
    if (
      !top.ok ||
      (file !== null && !same(file, expected)) ||
      (file === null && !same(dir, top.out))
    ) {
      return deny(
        `Blocked: ${MERGE_HELP} (could not tie the script to a git checkout).`,
      );
    }
    const files = [MERGE_SCRIPT, "package.json"];
    let clean = git(top.out, ["diff", "--quiet", MAIN_REF, "--", ...files]).ok;
    for (const f of files) {
      // Index flags (assume-unchanged) and untracked files hide from
      // `git diff`; comparing the blob hashes does not.
      const want = git(top.out, ["rev-parse", "--verify", `${MAIN_REF}:${f}`]);
      const have = git(top.out, ["hash-object", "--no-filters", "--", f]);
      if (!want.ok || !have.ok || want.out !== have.out) clean = false;
    }
    if (!clean) return deny(`Blocked: ${MERGE_HELP}.`);
  }
  return null;
}

function checkNode(argv, ctx) {
  const args = argv.slice(1);
  let script = false;
  let scriptWord = null;
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t === "--") {
      script = args.length > k + 1;
      scriptWord = args[k + 1] ?? null;
      break;
    }
    if (t === "-") {
      return deny(
        "Blocked: `node -` runs code from stdin. Run a file instead.",
      );
    }
    if (!t.startsWith("-")) {
      script = true;
      scriptWord = args[k];
      break;
    }
    const [name] = t.split("=");
    const longEval = ["--eval", "--print", "--interactive"].includes(
      name.replace(/_/g, "-"),
    );
    const shortEval = /^-[a-zA-Z]*[epi][a-zA-Z]*$/.test(t);
    if (longEval || shortEval) {
      return deny(
        "Blocked: `node -e/--eval/-p/--print` runs inline code that no one reviews. Put it in a file under scripts/ or tests/.",
      );
    }
    if (NODE_VALUE_OPTS.has(name) && !t.includes("=")) k++;
  }
  if (!script && args.length === 0) {
    return deny("Blocked: bare `node` starts a REPL or reads stdin.");
  }
  if (scriptWord && path.basename(scriptWord.text) === "merge-pr.mjs") {
    if (scriptWord.exp || scriptWord.glob) {
      return deny(
        `Blocked: the merge script path is built from a variable. ${MERGE_HELP}.`,
      );
    }
    return mergeGate(scriptWord.text, ctx);
  }
  return null;
}

function checkShell(argv, ctx, depth) {
  const args = argv.slice(1);
  let code = null;
  let hasC = false;
  let script = null;
  let stdinScript = false;
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t === "--") {
      // After `bash -s --` the remaining words are arguments, not a script.
      if (!stdinScript) script = args[k + 1] ?? null;
      break;
    }
    if (t === "--version" || t === "--help" || t === "-h") return null;
    if (["-o", "-O", "--rcfile", "--init-file"].includes(t)) {
      k++;
      continue;
    }
    if (/^[-+][A-Za-z]+$/.test(t)) {
      if (t.startsWith("-") && t.includes("c")) {
        hasC = true;
        code = args[k + 1] ?? null;
        break;
      }
      if (t.startsWith("-") && t.includes("s")) stdinScript = true;
      continue;
    }
    if (t.startsWith("-") || t.startsWith("+")) continue;
    script = args[k];
    break;
  }
  if (hasC) {
    if (!code) return deny("Blocked: `-c` without a command string.");
    if (code.exp) {
      return deny(
        "Blocked: `sh -c` was given a string built from a substitution or variable, so its content cannot be checked.",
      );
    }
    return checkString(code.text, ctx, depth + 1);
  }
  if (script) {
    if (script.exp) {
      return deny(
        "Blocked: a shell was given a script path built from a substitution or variable (for example `bash <(curl …)`).",
      );
    }
    return null;
  }
  return deny(
    "Blocked: a shell with no script file and no `-c` reads code from stdin (`echo … | bash`, `curl … | sh`). Run a script file.",
  );
}

function checkRm(argv, ctx) {
  const targets = [];
  let recursive = false;
  let afterDashes = false;
  for (const w of argv.slice(1)) {
    const t = w.text;
    if (!afterDashes && t === "--") afterDashes = true;
    else if (!afterDashes && t.startsWith("--")) {
      if (t === "--recursive") recursive = true;
    } else if (!afterDashes && t.startsWith("-") && t.length > 1) {
      if (/[rR]/.test(t)) recursive = true;
    } else targets.push(w);
  }
  if (!recursive) return null;
  if (targets.length === 0) {
    return deny(
      "Blocked: recursive `rm` with no visible target (arguments may arrive on stdin).",
    );
  }
  for (const w of targets) {
    if (!rmTargetIsSafe(w, ctx)) {
      return deny(
        `Blocked: recursive \`rm\` of "${w.text.replace(/\0/g, "$…")}" is outside \`.claude/worktrees/<name>\` and the OS temp directory. Relative paths are not trusted after a \`cd\`; use an absolute path.`,
      );
    }
  }
  return null;
}

function checkFind(argv, ctx, depth) {
  for (let k = 1; k < argv.length; k++) {
    if (["-exec", "-execdir", "-ok", "-okdir"].includes(argv[k].text)) {
      let end = k + 1;
      while (end < argv.length && ![";", "+"].includes(argv[end].text)) end++;
      const r = checkSimple(argv.slice(k + 1, end), ctx, depth);
      if (r) return r;
    }
  }
  return null;
}

/* --- dispatch ----------------------------------------------------- */

const RISKY_ENV =
  /^(GIT_CONFIG|GIT_SSH|GIT_EXEC_PATH|GIT_ASKPASS|GIT_EXTERNAL_DIFF|GIT_PROXY|GIT_TEMPLATE_DIR|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE|PATH=|BASH_ENV|ENV=|LD_|DYLD_|NODE_OPTIONS|GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GH_CONFIG_DIR)/;
// Denied wherever git or gh is also on the command line: they move the
// config, hooks or target repository that git and gh read.
const RISKY_ENV_GITGH =
  /^(HUSKY(_[A-Z_]*)?|SKIP|HOME|XDG_CONFIG_HOME|GH_HOST)=/;
const GITGH_WORD = /(^|[\s/;&|(`'"=])(git|gh)(?=[\s;&|)`'"]|$)/;

function checkEnvAssignment(assignment, ctx) {
  const deniedEnv = () =>
    deny(
      `Blocked: setting ${assignment.split("=")[0]} can redirect git or gh, skip or swap hooks, or change the logged-in account or target repository. That is the maintainer's.`,
    );
  if (RISKY_ENV.test(assignment)) return deniedEnv();
  if (ctx.gitish) {
    if (RISKY_ENV_GITGH.test(assignment)) return deniedEnv();
    const repo = /^GH_REPO=([\s\S]*)$/.exec(assignment);
    if (repo && repo[1] !== GH_REPO_OK) return deniedEnv();
  }
  return null;
}

function checkSimple(rawArgv, ctx, depth, redirs = []) {
  for (const w of rawArgv) {
    if (!w.quoted && RESERVED.has(w.text)) continue;
    if (!w.assign) break;
    const r = checkEnvAssignment(w.text, ctx);
    if (r) return r;
  }
  const argv = stripPrefix(rawArgv);
  const protectedHit = checkProtection(rawArgv, argv, redirs, ctx);
  if (protectedHit) return protectedHit;
  if (argv.length === 0) return null;
  const head = argv[0];
  // `[` and `[[` are the test builtin, not a glob.
  if (head.text === "[" || head.text === "[[") return null;
  if (!lit(head)) {
    return deny(
      "Blocked: the command name is built from a variable, glob, brace list or substitution, so it cannot be checked. Write the command out.",
    );
  }
  const base = baseName(head);
  if (base === "cd" || base === "pushd" || base === "popd") {
    ctx.cdSeen = true;
    // Track every directory later commands might run in (a `cd` can sit in a
    // subshell or after `||`, so the old ones stay candidates).
    const operand = argv.slice(1).find((w) => !w.text.startsWith("-"));
    const next = new Set(ctx.cwds);
    if (!operand || operand.exp || operand.glob || operand.text === "-") {
      next.add(null);
    } else {
      for (const c of ctx.cwds) {
        next.add(c === null ? null : path.resolve(c, operand.text));
      }
    }
    ctx.cwds = [...next];
  }
  if (["export", "declare", "typeset", "readonly", "local"].includes(base)) {
    for (const w of argv.slice(1)) {
      const r = checkEnvAssignment(w.text, ctx);
      if (r) return r;
    }
  }

  if (WRAPPERS.has(base)) {
    // The wrapped command starts at some later word. Check every suffix, and
    // refuse a wrapper whose first operand is an expansion (`env $C push`).
    let firstOperand = true;
    for (let k = 1; k < argv.length; k++) {
      const w = argv[k];
      const optionLike =
        w.text.startsWith("-") || /^\d+$/.test(w.text) || w.assign;
      if (firstOperand && !optionLike) {
        firstOperand = false;
        if (w.exp) {
          return deny(
            `Blocked: \`${base}\` was given a command built from a variable or substitution, so it cannot be checked.`,
          );
        }
      }
      if (base === "env" && w.assign) {
        const r = checkEnvAssignment(w.text, ctx);
        if (r) return r;
      }
      // `env -S "git push …"`, `env --split-string=…` and `watch "…"` carry
      // a whole command string (-S and --split-string may glue it on).
      if ((base === "env" || base === "watch") && /\s/.test(w.text) && !w.exp) {
        const body =
          base === "env"
            ? w.text.replace(/^(--split-string=|-[A-Za-z]*S)/, "")
            : w.text;
        const r = checkString(body, ctx, depth + 1);
        if (r) return r;
      }
      const r = checkLeaf(argv.slice(k), ctx, depth);
      if (r) return r;
    }
    return null;
  }
  return checkLeaf(argv, ctx, depth);
}

function checkLeaf(rawArgv, ctx, depth) {
  const argv = stripPrefix(rawArgv);
  if (argv.length === 0) return null;
  const head = argv[0];
  if (!lit(head)) return null; // an operand of a wrapper, not a command name
  const base = baseName(head);
  if (base === "git") return checkGit(argv, ctx);
  if (base === "gh") return checkGh(argv, ctx);
  if (base === "node" || base === "nodejs") return checkNode(argv, ctx);
  if (["npm", "pnpm", "yarn", "bun"].includes(base)) {
    if (argv.slice(1).some((w) => w.text === "merge-pr")) {
      return mergeGate(null, ctx);
    }
    return null;
  }
  if (base === "rg" || base === "ripgrep") {
    for (const w of argv.slice(1)) {
      if (w.text === "--") break;
      const name = w.text.split("=")[0];
      if (name.startsWith("--pre") || name === "--hostname-bin") {
        return deny(
          `Blocked: \`rg ${name}\` runs a program on every file it searches. Search with plain \`rg\` and filter the output.`,
        );
      }
    }
    return null;
  }
  if (base === "sort") {
    if (argv.slice(1).some((w) => prefixOf(w.text, "--compress-program", 4))) {
      return deny("Blocked: `sort --compress-program` runs a program.");
    }
    return null;
  }
  if (["awk", "gawk", "mawk", "nawk"].includes(base)) {
    return deny(
      "Blocked: `awk` is an inline scripting language and is not allowed. Use `rg`, `jq`, `cut` or a script file.",
    );
  }
  if (SHELLS.has(base)) return checkShell(argv, ctx, depth);
  if (base === "eval") {
    const rest = argv.slice(1);
    if (rest.some((w) => w.exp)) {
      return deny(
        "Blocked: `eval` of a string built from a substitution or variable.",
      );
    }
    return checkString(rest.map((w) => w.text).join(" "), ctx, depth + 1);
  }
  if (base === "source" || base === ".") {
    if (argv.slice(1).some((w) => w.exp)) {
      return deny(
        "Blocked: `source` of a path built from a substitution or variable.",
      );
    }
    return null;
  }
  if (base === "rm") return checkRm(argv, ctx);
  if (base === "find") return checkFind(argv, ctx, depth);
  return null;
}

function checkString(command, ctx, depth) {
  if (depth > 4)
    return deny("Blocked: shell commands nested more than four levels deep.");
  let cmds;
  try {
    const sub = { cmds: [], pipeCounter: 0 };
    new Parser(command, sub).parseTop();
    cmds = sub.cmds;
  } catch (e) {
    if (e instanceof ParseError) {
      return deny(
        `Blocked: could not parse the command (${e.message}). Simplify it.`,
      );
    }
    throw e;
  }

  const prevGitish = ctx.gitish;
  ctx.gitish = cmds.some((c) => c.argv.some((w) => GITGH_WORD.test(w.text)));
  try {
    for (const { argv, redirs } of cmds) {
      const r = checkSimple(argv, ctx, depth, redirs);
      if (r) return r;
    }
  } finally {
    ctx.gitish = prevGitish;
  }

  // Downloads piped into an interpreter.
  const byPipe = new Map();
  for (const c of cmds) {
    if (!byPipe.has(c.pipe)) byPipe.set(c.pipe, []);
    byPipe.get(c.pipe).push(c);
  }
  for (const group of byPipe.values()) {
    const names = group.map((c) => {
      const a = stripPrefix(c.argv);
      let k = 0;
      while (
        a[k] &&
        (WRAPPERS.has(baseName(a[k])) ||
          (k > 0 && (a[k].text.startsWith("-") || /^\d+$/.test(a[k].text))))
      ) {
        k++;
      }
      return baseName(a[k] ?? a[0]);
    });
    const dl = names.findIndex((n) => DOWNLOADERS.has(n));
    if (dl >= 0 && names.slice(dl + 1).some((n) => INTERPRETERS.has(n))) {
      return deny(
        "Blocked: piping a download into a shell or interpreter (`curl … | sh`) runs code no one reviewed. Download to a file, read it, then decide.",
      );
    }
  }
  return null;
}

/**
 * @param {{ tool_name?: string, tool_input?: { command?: unknown }, cwd?: string }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkBashCall(input) {
  if (input === null || typeof input !== "object") {
    return deny("Blocked: hook input was not an object.");
  }
  if (typeof input.tool_name === "string" && input.tool_name !== "Bash") {
    return { ok: true };
  }
  const command = input.tool_input?.command;
  if (typeof command !== "string") {
    return deny("Blocked: no command string in the hook input.");
  }
  const ctx = {
    cwd: path.resolve(
      typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
    ),
    cdSeen: false,
    cwds: [],
    gitish: false,
  };
  ctx.cwds = [ctx.cwd];
  const r = checkString(command, ctx, 0);
  return r ?? { ok: true };
}

/** Exit 2 with a message. Never throws, never returns. */
function failClosed(message) {
  try {
    process.stderr.write(`${message}\n`);
  } finally {
    process.exit(2);
  }
}

async function main() {
  process.on("uncaughtException", (e) =>
    failClosed(`guard-bash: internal error: ${e?.message ?? e}`),
  );
  process.on("unhandledRejection", (e) =>
    failClosed(`guard-bash: internal error: ${e?.message ?? e}`),
  );
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return failClosed("guard-bash: could not parse hook input");
    }
    const result = checkBashCall(input);
    if (!result.ok) failClosed(result.reason);
  } catch (e) {
    failClosed(`guard-bash: internal error: ${e?.message ?? e}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
