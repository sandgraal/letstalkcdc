/**
 * Unit tests for the Quiz component (Phase 2.2)
 *
 * Tests cover:
 * - Quiz initialization and DOM binding
 * - Answer selection (correct/incorrect)
 * - Score tracking and progress display
 * - Completion messages
 * - Reset functionality
 * - Tracing integration
 * - Edge cases (no questions, multiple quizzes)
 *
 * @module tests/unit/modules/quiz.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The quiz module auto-initializes on DOMContentLoaded / import.
// We re-implement the core logic inline for testability, consistent
// with how assistant.test.js handles side-effect-laden modules.
// Then we also test initQuizzes directly via dynamic import.

/**
 * Build a quiz container HTML matching the quiz.njk macro output.
 */
function buildQuizHTML({ id = "test-quiz", questions = [] } = {}) {
  const questionsHTML = questions
    .map(
      (q, qi) => `
      <div class="quiz-question" data-question-id="${id}-q${qi + 1}" data-correct="${q.correct}">
        <div class="question-header">
          <span class="question-number">Q${qi + 1}</span>
          <h4 class="question-text" id="${id}-q${qi + 1}-text">${q.question}</h4>
        </div>
        <div class="question-options" role="radiogroup">
          ${q.options
            .map(
              (opt, oi) => `
            <div class="option-wrapper">
              <input type="radio" id="${id}-q${qi + 1}-opt${oi + 1}"
                     name="${id}-q${qi + 1}" value="${oi + 1}"
                     class="option-input"
                     ${oi + 1 === parseInt(q.correct) ? 'data-correct="true"' : ""}>
              <label for="${id}-q${qi + 1}-opt${oi + 1}" class="option-label">
                <span class="option-letter">${["A", "B", "C", "D"][oi]}</span>
                <span class="option-text">${opt}</span>
              </label>
            </div>`,
            )
            .join("")}
        </div>
        <div class="question-feedback" role="alert" aria-live="polite">
          <div class="feedback-correct" hidden>
            <span class="feedback-icon">✓</span>
            <div class="feedback-content"><strong>Correct!</strong>${q.explanation ? `<p>${q.explanation}</p>` : ""}</div>
          </div>
          <div class="feedback-incorrect" hidden>
            <span class="feedback-icon">✗</span>
            <div class="feedback-content"><strong>Not quite.</strong>${q.hint ? `<p>${q.hint}</p>` : "<p>Review the correct answer and explanation.</p>"}</div>
          </div>
        </div>
      </div>`,
    )
    .join("");

  return `
    <section class="quiz-container" id="${id}" data-quiz-id="${id}">
      <header class="quiz-header">
        <h3 class="quiz-title" id="${id}-title">Test Quiz</h3>
      </header>
      <div class="quiz-progress">
        <div class="quiz-progress-track" role="progressbar"
             aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="0"
             data-progress-track>
          <div class="quiz-progress-fill" data-progress-fill></div>
        </div>
        <div class="quiz-progress-meta">
          <span class="quiz-progress-count">
            <span data-progress-count>0</span> / <span data-progress-total>${questions.length}</span>
          </span>
        </div>
      </div>
      <div class="quiz-questions" role="group" aria-labelledby="${id}-title">
        ${questionsHTML}
      </div>
      <div class="quiz-summary" role="status" aria-live="polite">
        <div class="summary-content">
          <span class="summary-score">
            <strong><span data-score-current>0</span>/<span data-score-total>${questions.length}</span></strong>
          </span>
          <button type="button" class="quiz-reset-button" hidden>↻ Try Again</button>
        </div>
        <div class="summary-message" data-summary-message hidden></div>
      </div>
    </section>`;
}

const SAMPLE_QUESTIONS = [
  {
    question: "What is CDC?",
    options: [
      "Change Data Capture",
      "Central Data Center",
      "Core Data Controller",
    ],
    correct: "1",
    explanation: "CDC stands for Change Data Capture.",
  },
  {
    question: "Which database log does CDC read?",
    options: ["Error log", "Transaction log", "Access log", "Query log"],
    correct: "2",
    hint: "Think about where committed changes are recorded.",
  },
  {
    question: "What is a connector?",
    options: [
      "A UI component",
      "A plugin that bridges source and sink",
      "A network cable",
    ],
    correct: "2",
    explanation: "Connectors bridge source databases and target systems.",
  },
];

/**
 * Helper: select an option by dispatching a change event.
 */
function selectOption(container, questionIndex, optionValue) {
  const question = container.querySelectorAll(".quiz-question")[questionIndex];
  const input = question.querySelector(`input[value="${optionValue}"]`);
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("quiz component", () => {
  let container;

  beforeEach(async () => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    window._educationTracer = undefined;

    // Reset module cache so initQuizzes re-runs fresh
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: set up a quiz and initialize it.
   */
  async function setupQuiz(questions = SAMPLE_QUESTIONS) {
    document.body.innerHTML = buildQuizHTML({ questions });
    container = document.querySelector(".quiz-container");

    // Simulate DOMContentLoaded by importing quiz.js fresh
    // The module auto-calls initQuizzes if document.readyState !== 'loading'
    await import("../../../src/assets/js/lib/quiz.js?" + Date.now());

    return container;
  }

  describe("initialization", () => {
    it("initializes quiz containers found in DOM", async () => {
      await setupQuiz();

      // Score should be initialized
      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("0");

      const scoreTotal = container.querySelector("[data-score-total]");
      expect(scoreTotal.textContent).toBe("3");
    });

    it("sets up progress bar with correct total", async () => {
      await setupQuiz();

      const progressCount = container.querySelector("[data-progress-count]");
      expect(progressCount.textContent).toBe("0");

      const progressTotal = container.querySelector("[data-progress-total]");
      expect(progressTotal.textContent).toBe("3");

      const progressTrack = container.querySelector("[data-progress-track]");
      expect(progressTrack.getAttribute("aria-valuemax")).toBe("3");
      expect(progressTrack.getAttribute("aria-valuenow")).toBe("0");
    });

    it("hides reset button initially", async () => {
      await setupQuiz();

      const resetBtn = container.querySelector(".quiz-reset-button");
      expect(resetBtn.hidden).toBe(true);
    });

    it("hides summary message initially", async () => {
      await setupQuiz();

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(true);
    });

    it("starts all feedback elements hidden", async () => {
      await setupQuiz();

      container
        .querySelectorAll(".feedback-correct, .feedback-incorrect")
        .forEach((el) => {
          expect(el.hidden).toBe(true);
        });
    });
  });

  describe("answering questions", () => {
    it("shows correct feedback for right answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct answer

      const question = container.querySelectorAll(".quiz-question")[0];
      expect(question.classList.contains("answered")).toBe(true);
      expect(question.classList.contains("correct")).toBe(true);

      const correctFeedback = question.querySelector(".feedback-correct");
      expect(correctFeedback.hidden).toBe(false);

      const incorrectFeedback = question.querySelector(".feedback-incorrect");
      expect(incorrectFeedback.hidden).toBe(true);
    });

    it("shows incorrect feedback for wrong answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "2"); // Wrong answer

      const question = container.querySelectorAll(".quiz-question")[0];
      expect(question.classList.contains("answered")).toBe(true);
      expect(question.classList.contains("incorrect")).toBe(true);

      const incorrectFeedback = question.querySelector(".feedback-incorrect");
      expect(incorrectFeedback.hidden).toBe(false);

      const correctFeedback = question.querySelector(".feedback-correct");
      expect(correctFeedback.hidden).toBe(true);
    });

    it("highlights the correct answer on wrong selection", async () => {
      await setupQuiz();

      selectOption(container, 0, "3"); // Wrong answer

      const question = container.querySelectorAll(".quiz-question")[0];
      const correctWrapper = question
        .querySelector('[data-correct="true"]')
        .closest(".option-wrapper");
      expect(correctWrapper.classList.contains("is-correct-answer")).toBe(true);
    });

    it("marks the wrong choice with is-incorrect-choice", async () => {
      await setupQuiz();

      selectOption(container, 0, "2"); // Wrong answer

      const question = container.querySelectorAll(".quiz-question")[0];
      const incorrectInput = question.querySelector('input[value="2"]');
      const wrapper = incorrectInput.closest(".option-wrapper");
      expect(wrapper.classList.contains("is-incorrect-choice")).toBe(true);
    });

    it("disables all options after answering", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");

      const question = container.querySelectorAll(".quiz-question")[0];
      const inputs = question.querySelectorAll(".option-input");
      inputs.forEach((input) => {
        expect(input.disabled).toBe(true);
      });
    });

    it("prevents re-answering a question", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct
      selectOption(container, 0, "2"); // Try to re-answer — should be ignored

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("1"); // Still 1, not 0
    });
  });

  describe("score tracking", () => {
    it("updates score on correct answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("1");
    });

    it("does not increment score on wrong answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "3"); // Wrong

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("0");
    });

    it("accumulates score across multiple questions", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct
      selectOption(container, 1, "2"); // Correct
      selectOption(container, 2, "1"); // Wrong

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("2");
    });

    it("shows reset button after first answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");

      const resetBtn = container.querySelector(".quiz-reset-button");
      expect(resetBtn.hidden).toBe(false);
    });
  });

  describe("progress tracking", () => {
    it("updates progress count after each answer", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      const progressCount = container.querySelector("[data-progress-count]");
      expect(progressCount.textContent).toBe("1");

      selectOption(container, 1, "2");
      expect(progressCount.textContent).toBe("2");
    });

    it("updates progress bar aria attributes", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");

      const progressTrack = container.querySelector("[data-progress-track]");
      expect(progressTrack.getAttribute("aria-valuenow")).toBe("1");
      expect(progressTrack.getAttribute("aria-valuetext")).toBe(
        "1 of 3 questions answered",
      );
    });

    it("updates progress fill width", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");

      const fill = container.querySelector("[data-progress-fill]");
      expect(fill.style.width).toBe("33%");
    });

    it("adds is-complete class when all answered", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");
      selectOption(container, 2, "2");

      const fill = container.querySelector("[data-progress-fill]");
      expect(fill.classList.contains("is-complete")).toBe(true);
      expect(fill.style.width).toBe("100%");
    });
  });

  describe("completion messages", () => {
    it("shows perfect score message at 100%", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct
      selectOption(container, 1, "2"); // Correct
      selectOption(container, 2, "2"); // Correct

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(false);
      expect(summaryMsg.textContent).toContain("Perfect score");
      expect(summaryMsg.classList.contains("perfect")).toBe(true);
    });

    it("shows great job message at 67% (2/3)", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct
      selectOption(container, 1, "2"); // Correct
      selectOption(container, 2, "1"); // Wrong

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(false);
      // 67% → "Good effort!" (60-79%)
      expect(summaryMsg.textContent).toContain("Good effort");
      expect(summaryMsg.classList.contains("okay")).toBe(true);
    });

    it("shows keep learning message at <60%", async () => {
      await setupQuiz();

      selectOption(container, 0, "3"); // Wrong
      selectOption(container, 1, "1"); // Wrong
      selectOption(container, 2, "1"); // Wrong

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(false);
      expect(summaryMsg.textContent).toContain("Keep learning");
      expect(summaryMsg.classList.contains("needs-work")).toBe(true);
    });

    it("does not show summary message before all questions answered", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(true);
    });
  });

  describe("reset functionality", () => {
    it("resets score to 0", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("0");
    });

    it("re-enables all options", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const inputs = container.querySelectorAll(".option-input");
      inputs.forEach((input) => {
        expect(input.disabled).toBe(false);
        expect(input.checked).toBe(false);
      });
    });

    it("clears answered/correct/incorrect classes", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "3");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const questions = container.querySelectorAll(".quiz-question");
      questions.forEach((q) => {
        expect(q.classList.contains("answered")).toBe(false);
        expect(q.classList.contains("correct")).toBe(false);
        expect(q.classList.contains("incorrect")).toBe(false);
      });
    });

    it("hides all feedback after reset", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "3");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      container
        .querySelectorAll(".feedback-correct, .feedback-incorrect")
        .forEach((el) => {
          expect(el.hidden).toBe(true);
        });
    });

    it("clears visual indicator classes after reset", async () => {
      await setupQuiz();

      selectOption(container, 0, "2"); // Wrong

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const wrappers = container.querySelectorAll(".option-wrapper");
      wrappers.forEach((wrapper) => {
        expect(wrapper.classList.contains("is-correct-answer")).toBe(false);
        expect(wrapper.classList.contains("is-incorrect-choice")).toBe(false);
      });
    });

    it("hides reset button after reset", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      expect(resetBtn.hidden).toBe(true);
    });

    it("hides and clears summary message after reset", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");
      selectOption(container, 2, "2");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const summaryMsg = container.querySelector("[data-summary-message]");
      expect(summaryMsg.hidden).toBe(true);
      expect(summaryMsg.textContent).toBe("");
    });

    it("resets progress display", async () => {
      await setupQuiz();

      selectOption(container, 0, "1");
      selectOption(container, 1, "2");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      const progressCount = container.querySelector("[data-progress-count]");
      expect(progressCount.textContent).toBe("0");

      const progressTrack = container.querySelector("[data-progress-track]");
      expect(progressTrack.getAttribute("aria-valuenow")).toBe("0");
    });

    it("allows re-answering after reset", async () => {
      await setupQuiz();

      selectOption(container, 0, "1"); // Correct first time
      const scoreBefore = container.querySelector(
        "[data-score-current]",
      ).textContent;
      expect(scoreBefore).toBe("1");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      // Re-answer same question with wrong answer
      selectOption(container, 0, "3");

      const scoreAfter = container.querySelector(
        "[data-score-current]",
      ).textContent;
      expect(scoreAfter).toBe("0");
    });
  });

  describe("tracing integration", () => {
    it("tracks quiz-answer event on correct answer", async () => {
      window._educationTracer = {
        trackInteraction: vi.fn(),
      };

      await setupQuiz();
      selectOption(container, 0, "1");

      expect(window._educationTracer.trackInteraction).toHaveBeenCalledWith(
        "quiz-answer",
        expect.objectContaining({
          quizId: "test-quiz",
          questionIndex: 0,
          correct: true,
        }),
      );
    });

    it("tracks quiz-answer event on incorrect answer", async () => {
      window._educationTracer = {
        trackInteraction: vi.fn(),
      };

      await setupQuiz();
      selectOption(container, 0, "3");

      expect(window._educationTracer.trackInteraction).toHaveBeenCalledWith(
        "quiz-answer",
        expect.objectContaining({
          quizId: "test-quiz",
          questionIndex: 0,
          correct: false,
        }),
      );
    });

    it("tracks quiz-complete event when all answered", async () => {
      window._educationTracer = {
        trackInteraction: vi.fn(),
      };

      await setupQuiz();
      selectOption(container, 0, "1");
      selectOption(container, 1, "2");
      selectOption(container, 2, "2");

      expect(window._educationTracer.trackInteraction).toHaveBeenCalledWith(
        "quiz-complete",
        expect.objectContaining({
          quizId: "test-quiz",
          score: 3,
          total: 3,
          percentage: 100,
        }),
      );
    });

    it("tracks quiz-reset event", async () => {
      window._educationTracer = {
        trackInteraction: vi.fn(),
      };

      await setupQuiz();
      selectOption(container, 0, "1");

      const resetBtn = container.querySelector(".quiz-reset-button");
      resetBtn.click();

      expect(window._educationTracer.trackInteraction).toHaveBeenCalledWith(
        "quiz-reset",
        expect.objectContaining({
          quizId: "test-quiz",
        }),
      );
    });

    it("works without tracer (no errors)", async () => {
      window._educationTracer = undefined;

      await setupQuiz();

      // Should not throw
      expect(() => {
        selectOption(container, 0, "1");
      }).not.toThrow();
    });

    it("handles tracer with non-function trackInteraction", async () => {
      window._educationTracer = {
        trackInteraction: "not a function",
      };

      await setupQuiz();

      expect(() => {
        selectOption(container, 0, "1");
      }).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles quiz with no questions gracefully", async () => {
      document.body.innerHTML = buildQuizHTML({ questions: [] });
      container = document.querySelector(".quiz-container");

      await import("../../../src/assets/js/lib/quiz.js?" + Date.now());

      const scoreCurrent = container.querySelector("[data-score-current]");
      expect(scoreCurrent.textContent).toBe("0");
    });

    it("handles multiple quizzes on same page", async () => {
      const html1 = buildQuizHTML({
        id: "quiz-1",
        questions: [SAMPLE_QUESTIONS[0]],
      });
      const html2 = buildQuizHTML({
        id: "quiz-2",
        questions: [SAMPLE_QUESTIONS[1]],
      });
      document.body.innerHTML = html1 + html2;

      await import("../../../src/assets/js/lib/quiz.js?" + Date.now());

      const quiz1 = document.getElementById("quiz-1");
      const quiz2 = document.getElementById("quiz-2");

      // Answer quiz 1 correctly
      const q1Input = quiz1.querySelector('input[value="1"]');
      q1Input.checked = true;
      q1Input.dispatchEvent(new Event("change", { bubbles: true }));

      expect(quiz1.querySelector("[data-score-current]").textContent).toBe("1");
      expect(quiz2.querySelector("[data-score-current]").textContent).toBe("0");
    });

    it("handles quiz without optional DOM elements", async () => {
      // Minimal quiz HTML without progress bar or summary
      document.body.innerHTML = `
        <section class="quiz-container" id="minimal-quiz" data-quiz-id="minimal-quiz">
          <div class="quiz-questions">
            <div class="quiz-question" data-correct="1">
              <div class="question-options" role="radiogroup">
                <div class="option-wrapper">
                  <input type="radio" name="q1" value="1" class="option-input" data-correct="true">
                </div>
                <div class="option-wrapper">
                  <input type="radio" name="q1" value="2" class="option-input">
                </div>
              </div>
              <div class="question-feedback">
                <div class="feedback-correct" hidden><strong>Correct!</strong></div>
                <div class="feedback-incorrect" hidden><strong>Wrong.</strong></div>
              </div>
            </div>
          </div>
        </section>`;

      container = document.querySelector(".quiz-container");

      // Should not throw even without progress/score/reset elements
      await import("../../../src/assets/js/lib/quiz.js?" + Date.now());

      const input = container.querySelector('input[value="1"]');
      input.checked = true;
      expect(() => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }).not.toThrow();
    });
  });
});
