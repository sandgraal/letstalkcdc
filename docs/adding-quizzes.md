# Adding Quizzes to Modules

This guide explains how to add interactive quizzes to any module in the Let's Talk CDC series. Quizzes help learners validate their understanding of key concepts covered in each module.

## Overview

The quiz system consists of three main components:

1. **Quiz Component** (`src/_includes/components/quiz.njk`) - Reusable Nunjucks macro
2. **Quiz JavaScript** (`src/assets/js/lib/quiz.js`) - Interactive logic, scoring, and feedback
3. **Quiz CSS** (`src/assets/css/components/quiz.css`) - Styling (automatically included)

## Quick Start

To add a quiz to a module, follow these four steps:

### 1. Add Quiz Data to Module Configuration

Edit your module's `index.11tydata.cjs` file and add a `quizConfig` object:

```javascript
module.exports = {
  seriesKey: 'your-module',
  heroConfig: {
    // ... existing hero config
  },
  quizConfig: {
    id: "your-module-quiz",
    title: "Test Your Understanding",
    description: "Check your knowledge of key concepts from this module.",
    questions: [
      {
        question: "What is the main advantage of log-based CDC?",
        options: [
          "It's the fastest method",
          "It has minimal impact on the source database",
          "It requires no configuration",
          "It works without permissions"
        ],
        correct: "2",  // 1-indexed (option B is correct)
        explanation: "Log-based CDC reads from transaction logs, which minimizes the impact on the source database while capturing all changes reliably."
      },
      // Add 4-6 questions per quiz
      {
        question: "Second question here?",
        options: ["A", "B", "C", "D"],
        correct: "1",
        explanation: "Explanation of the correct answer...",
        hint: "Optional hint for incorrect answers"
      }
    ]
  }
};
```

### 2. Import the Quiz Macro

At the top of your module's `index.njk` file, import the quiz component:

```njk
---
layout: base.njk
title: "Your Module Title"
description: "Module description"
scripts:
  - "/assets/js/lib/quiz.js"
---
{% import "components/quiz.njk" as quizMacro %}
```

**Note**: Add the quiz script to the `scripts` array in the frontmatter.

### 3. Render the Quiz

Place the quiz component where you want it to appear in your module (typically near the end, before "Next Steps"):

```njk
{{ quizMacro.quiz(quizConfig) | safe }}
```

### 4. Build and Test

```bash
npm run build
npm run dev
```

Visit your module page and test the quiz functionality.

## Quiz Configuration Options

### Quiz Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the quiz (used in HTML `id` attribute) |
| `title` | string | Yes | Quiz title displayed at the top |
| `description` | string | No | Short description shown below the title |
| `questions` | array | Yes | Array of question objects (see below) |

### Question Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `question` | string | Yes | The question text |
| `options` | array | Yes | Array of 3-5 answer options (strings) |
| `correct` | string | Yes | 1-indexed position of correct answer ("1", "2", "3", "4") |
| `explanation` | string | Yes | Detailed explanation shown after correct answer |
| `hint` | string | No | Optional hint shown for incorrect answers |

## Best Practices

### Question Design

1. **Aim for 4-6 questions per quiz** - Enough to validate understanding without overwhelming learners
2. **Focus on key concepts** - Test the most important takeaways from the module
3. **Write clear, unambiguous questions** - Avoid trick questions or overly complex language
4. **Provide educational explanations** - Help learners understand why the answer is correct
5. **Use realistic scenarios** - When possible, frame questions around practical situations

### Question Types to Include

- **Conceptual understanding**: "What is the primary purpose of...?"
- **Comparison**: "What is the difference between X and Y?"
- **Best practices**: "What is the recommended approach for...?"
- **Troubleshooting**: "What is the most likely cause of...?"
- **Implementation**: "Which component is responsible for...?"

### Example Questions

**Good Question:**
```javascript
{
  question: "What is a high-watermark in CDC snapshotting?",
  options: [
    "The maximum table size",
    "A log position marking the snapshot boundary",
    "The peak memory usage",
    "The longest running transaction"
  ],
  correct: "2",
  explanation: "The high-watermark is a log position (LSN/SCN) that marks where the snapshot ends and streaming begins, ensuring no gaps or duplicates."
}
```

**Avoid:**
```javascript
{
  question: "Is CDC good?", // Too vague
  options: ["Yes", "No", "Maybe", "Sometimes"], // Not educational
  correct: "1",
  explanation: "Yes." // Not helpful
}
```

## Features

The quiz component includes:

### Interactive Features
- **Immediate feedback** - Shows correct/incorrect status after each answer
- **Visual indicators** - Green for correct, red for incorrect, with checkmarks/X icons
- **Score tracking** - Displays current score (e.g., "3/5 correct")
- **Try Again button** - Allows learners to reset and retake the quiz
- **Completion messages** - Encouraging feedback based on score percentage:
  - 100%: "🎉 Perfect score!"
  - 80%+: "✨ Great job!"
  - 60%+: "👍 Good effort!"
  - <60%: "📚 Keep learning!"

### Accessibility Features
- **Keyboard navigation** - Full keyboard support for all interactions
- **Screen reader support** - Proper ARIA labels and live regions
- **High contrast** - Meets WCAG AA contrast requirements
- **Focus indicators** - Clear visual focus states
- **Semantic HTML** - Radio buttons with proper labels

### Progressive Enhancement
- **Works without JavaScript** - All questions and answers visible
- **JavaScript enhanced** - Interactive scoring and feedback when JS available

### Responsive Design
- **Mobile-friendly** - Touch-optimized for small screens
- **Desktop-optimized** - Comfortable reading on large displays
- **Dark mode** - Automatic theme switching

## Styling Customization

The quiz uses CSS variables from the design system. To customize appearance for a specific module, you can override in your module's CSS file:

```css
/* Override quiz colors for this module */
#your-module-quiz {
  --color-primary: #your-color;
}

/* Adjust spacing */
#your-module-quiz .quiz-question {
  margin-bottom: 3rem;
}
```

## Troubleshooting

### Quiz Not Rendering

1. **Check frontmatter**: Ensure `scripts` includes `/assets/js/lib/quiz.js`
2. **Verify import**: Confirm `{% import "components/quiz.njk" as quizMacro %}` is present
3. **Check data**: Ensure `quizConfig` exists in `index.11tydata.cjs`
4. **Build site**: Run `npm run build` to regenerate pages

### Quiz Not Interactive

1. **Check browser console** for JavaScript errors
2. **Verify script loading**: Check Network tab in DevTools
3. **Test without extensions**: Disable ad blockers or privacy extensions
4. **Check quiz ID**: Ensure `id` in quizConfig is unique across site

### Styling Issues

1. **Clear cache**: Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. **Check CSS import**: Verify quiz.css is imported in `04-components.css`
3. **Inspect element**: Use browser DevTools to check computed styles

## Integration with Tracing

Quizzes automatically integrate with the site's OpenTelemetry tracing system (if enabled). Events tracked:

- `quiz-answer` - When a question is answered
- `quiz-complete` - When all questions are answered
- `quiz-reset` - When the "Try Again" button is clicked

This helps understand learner engagement and identify which questions are most challenging.

## Examples

See these modules for working quiz implementations:

- **Introduction Module** (`src/intro/`) - 5 questions on CDC fundamentals
- **Snapshotting Module** (`src/snapshotting/`) - 5 questions on initial load concepts

## Related Documentation

- [Adding New Modules](./adding-modules.md) - Complete module creation guide
- [Component Documentation](../src/_includes/components/) - Other reusable components
- [Styling Guide](../STYLING-IMPROVEMENTS.md) - Design system reference
