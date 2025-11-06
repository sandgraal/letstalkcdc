/**
 * Quiz component logic
 * Handles quiz interactions, scoring, and feedback
 */

export function initQuizzes() {
  const quizContainers = document.querySelectorAll('.quiz-container');
  
  quizContainers.forEach(container => {
    initQuiz(container);
  });
}

function initQuiz(container) {
  const questions = container.querySelectorAll('.quiz-question');
  const scoreCurrentEl = container.querySelector('[data-score-current]');
  const scoreTotalEl = container.querySelector('[data-score-total]');
  const summaryMessageEl = container.querySelector('[data-summary-message]');
  const resetButton = container.querySelector('.quiz-reset-button');
  
  const state = {
    answered: new Set(),
    correct: new Set(),
    total: questions.length
  };

  // Initialize each question
  questions.forEach((question, questionIndex) => {
    const options = question.querySelectorAll('.option-input');
    const correctAnswer = question.dataset.correct;
    const feedbackContainer = question.querySelector('.question-feedback');
    const correctFeedback = feedbackContainer.querySelector('.feedback-correct');
    const incorrectFeedback = feedbackContainer.querySelector('.feedback-incorrect');

    options.forEach(option => {
      option.addEventListener('change', (e) => {
        if (state.answered.has(questionIndex)) {
          return; // Already answered, no re-answers allowed
        }

        const selectedValue = e.target.value;
        const isCorrect = selectedValue === correctAnswer;

        // Mark as answered
        state.answered.add(questionIndex);
        
        // Update correct count
        if (isCorrect) {
          state.correct.add(questionIndex);
        }

        // Show feedback
        question.classList.add('answered');
        question.classList.add(isCorrect ? 'correct' : 'incorrect');
        
        // Disable all options for this question
        options.forEach(opt => {
          opt.disabled = true;
        });

        // Highlight the correct answer
        const correctOption = question.querySelector(`[data-correct="true"]`);
        if (correctOption) {
          correctOption.closest('.option-wrapper').classList.add('is-correct-answer');
        }

        // Show appropriate feedback
        if (isCorrect) {
          correctFeedback.hidden = false;
        } else {
          incorrectFeedback.hidden = false;
          e.target.closest('.option-wrapper').classList.add('is-incorrect-choice');
        }

        // Update score
        updateScore();

        // Track completion event (if tracing is available)
        if (window._educationTracer && typeof window._educationTracer.trackInteraction === 'function') {
          window._educationTracer.trackInteraction('quiz-answer', {
            quizId: container.dataset.quizId,
            questionIndex,
            correct: isCorrect
          });
        }
      });
    });
  });

  // Reset button handler
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      resetQuiz();
      
      if (window._educationTracer && typeof window._educationTracer.trackInteraction === 'function') {
        window._educationTracer.trackInteraction('quiz-reset', {
          quizId: container.dataset.quizId
        });
      }
    });
  }

  function updateScore() {
    const currentScore = state.correct.size;
    const answeredCount = state.answered.size;
    
    // Update score display
    if (scoreCurrentEl) {
      scoreCurrentEl.textContent = currentScore;
    }
    
    // Show reset button if at least one question answered
    if (resetButton && answeredCount > 0) {
      resetButton.hidden = false;
    }

    // Show completion message when all questions answered
    if (answeredCount === state.total) {
      showCompletionMessage(currentScore, state.total);
    }
  }

  function showCompletionMessage(score, total) {
    if (!summaryMessageEl) return;

    const percentage = Math.round((score / total) * 100);
    let message = '';
    let messageClass = '';

    if (percentage === 100) {
      message = '🎉 Perfect score! You have a solid understanding of this topic.';
      messageClass = 'perfect';
    } else if (percentage >= 80) {
      message = '✨ Great job! You\'ve mastered most of the concepts.';
      messageClass = 'good';
    } else if (percentage >= 60) {
      message = '👍 Good effort! Review the explanations to strengthen your understanding.';
      messageClass = 'okay';
    } else {
      message = '📚 Keep learning! Review the module content and try again.';
      messageClass = 'needs-work';
    }

    summaryMessageEl.textContent = message;
    summaryMessageEl.className = `summary-message ${messageClass}`;
    summaryMessageEl.hidden = false;

    // Track completion
    if (window._educationTracer && typeof window._educationTracer.trackInteraction === 'function') {
      window._educationTracer.trackInteraction('quiz-complete', {
        quizId: container.dataset.quizId,
        score,
        total,
        percentage
      });
    }
  }

  function resetQuiz() {
    // Clear state
    state.answered.clear();
    state.correct.clear();

    // Reset all questions
    questions.forEach(question => {
      question.classList.remove('answered', 'correct', 'incorrect');
      
      // Re-enable all options
      const options = question.querySelectorAll('.option-input');
      options.forEach(opt => {
        opt.disabled = false;
        opt.checked = false;
      });

      // Clear visual indicators
      const optionWrappers = question.querySelectorAll('.option-wrapper');
      optionWrappers.forEach(wrapper => {
        wrapper.classList.remove('is-correct-answer', 'is-incorrect-choice');
      });

      // Hide feedback
      const feedbacks = question.querySelectorAll('.feedback-correct, .feedback-incorrect');
      feedbacks.forEach(feedback => {
        feedback.hidden = true;
      });
    });

    // Reset score display
    if (scoreCurrentEl) {
      scoreCurrentEl.textContent = '0';
    }

    // Hide reset button and summary message
    if (resetButton) {
      resetButton.hidden = true;
    }
    if (summaryMessageEl) {
      summaryMessageEl.textContent = '';
      summaryMessageEl.hidden = true;
    }
  }
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizzes);
  } else {
    initQuizzes();
  }
}
