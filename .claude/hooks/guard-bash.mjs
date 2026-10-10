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
    let pipe = this.newPipe();
    const flush = () => {
      if (cur.length) this.ctx.cmds.push({ argv: cur, pipe });
      cur = [];
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
    return { text, exp, glob, quoted, assign };
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
const BRANCH_RE = /^claude\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

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
      BRANCH_RE.test(b) && !b.includes("..") && !b.endsWith(".lock");
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

function checkGit(argv, ctx) {
  let k = 1;
  let dir = null;
  while (k < argv.length) {
    const w = argv[k];
    const t = w.text;
    if (!t.startsWith("-")) break;
    const [name] = t.split("=");
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

  if (name === "config") {
    for (const a of args) {
      if (RISKY_GIT_CONFIG.test(a.text)) {
        return deny(
          `Blocked: \`git config ${a.text}\` can swap hooks, aliases, remotes or signing. That is a maintainer change.`,
        );
      }
    }
    return null;
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

function checkGh(argv) {
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

function checkNode(argv) {
  const args = argv.slice(1);
  let script = false;
  for (let k = 0; k < args.length; k++) {
    const t = args[k].text;
    if (t === "--") {
      script = args.length > k + 1;
      break;
    }
    if (t === "-") {
      return deny(
        "Blocked: `node -` runs code from stdin. Run a file instead.",
      );
    }
    if (!t.startsWith("-")) {
      script = true;
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
  /^(GIT_CONFIG|GIT_SSH|GIT_EXEC_PATH|GIT_ASKPASS|GIT_EXTERNAL_DIFF|GIT_PROXY|GIT_TEMPLATE_DIR|PATH=|BASH_ENV|ENV=|LD_|DYLD_|NODE_OPTIONS|GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GH_CONFIG_DIR)/;

function checkEnvAssignment(assignment) {
  if (!RISKY_ENV.test(assignment)) return null;
  return deny(
    `Blocked: setting ${assignment.split("=")[0]} can redirect git or gh, swap hooks or change the logged-in account. That is the maintainer's.`,
  );
}

function checkSimple(rawArgv, ctx, depth) {
  for (const w of rawArgv) {
    if (!w.quoted && RESERVED.has(w.text)) continue;
    if (!w.assign) break;
    const r = checkEnvAssignment(w.text);
    if (r) return r;
  }
  const argv = stripPrefix(rawArgv);
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
  if (base === "cd" || base === "pushd" || base === "popd") ctx.cdSeen = true;
  if (["export", "declare", "typeset", "readonly", "local"].includes(base)) {
    for (const w of argv.slice(1)) {
      const r = checkEnvAssignment(w.text);
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
      // `env -S "git push …"` and `watch "…"` carry a whole command string.
      if ((base === "env" || base === "watch") && /\s/.test(w.text) && !w.exp) {
        const r = checkString(w.text, ctx, depth + 1);
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
  if (base === "gh") return checkGh(argv);
  if (base === "node" || base === "nodejs") return checkNode(argv);
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

  for (const { argv } of cmds) {
    const r = checkSimple(argv, ctx, depth);
    if (r) return r;
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
  };
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
