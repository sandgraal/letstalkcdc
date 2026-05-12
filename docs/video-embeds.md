# Video Embed Component Guide

This guide explains how to embed video content in Let's Talk CDC modules.

## Overview

The video embed component provides a responsive, accessible way to include video content in your modules. It supports:

- **YouTube** and **Vimeo** videos
- **Direct video** embeds (MP4, WebM, etc.)
- **Lazy loading** with thumbnail preview and click-to-play
- **Accessibility** features (ARIA labels, keyboard navigation, transcripts)
- **Responsive design** (works on mobile, tablet, and desktop)

## Basic Usage

### Import the Component

First, import the video embed macros in your Nunjucks template:

```njk
{% from "components/video-embed.njk" import videoEmbed, youtubeEmbed, vimeoEmbed %}
```

### YouTube Videos

The simplest way to embed a YouTube video:

```njk
{{ youtubeEmbed('VIDEO_ID', {
  title: 'Video Title',
  description: 'Brief description of what the video covers',
  caption: 'Optional caption text that appears below the video'
}) }}
```

**Example:**

```njk
{{ youtubeEmbed('5CjPj9ShJVA', {
  title: 'Introduction to Change Data Capture',
  description: 'A visual overview of CDC fundamentals and why it matters.',
  caption: 'Gunnar Morling explains CDC at Kafka Summit 2021.'
}) }}
```

### Vimeo Videos

For Vimeo videos, use the `vimeoEmbed` macro:

```njk
{{ vimeoEmbed('123456789', {
  title: 'CDC Architecture Patterns',
  description: 'Detailed walkthrough of common CDC architectures',
  caption: 'Conference talk from Data Engineering Summit 2023'
}) }}
```

### Custom Video Embeds

For other video platforms or custom embeds:

```njk
{{ videoEmbed({
  src: 'https://example.com/embed/video',
  title: 'Video Title',
  description: 'Video description',
  caption: 'Optional caption',
  aspectRatio: '16/9',  # Optional, defaults to 16:9
  thumbnail: '/images/video-thumbnail.jpg'  # Optional, enables lazy loading
}) }}
```

## Features

### Lazy Loading with Thumbnails

By default, YouTube videos use lazy loading with a thumbnail preview. The actual video iframe only loads when the user clicks the play button. This improves page load performance.

**YouTube thumbnails** are automatically fetched from YouTube's CDN. For other platforms, provide a custom thumbnail:

```njk
{{ videoEmbed({
  src: 'https://player.vimeo.com/video/123456789',
  title: 'My Video',
  thumbnail: '/images/my-video-thumbnail.jpg'
}) }}
```

### Transcripts

Add an expandable transcript for accessibility:

```njk
{{ youtubeEmbed('VIDEO_ID', {
  title: 'Video Title',
  transcript: '<p>Full transcript text here...</p><p>Can include multiple paragraphs.</p>'
}) }}
```

### Aspect Ratios

The default aspect ratio is 16:9, which works for most videos. To use a different ratio:

```njk
{{ videoEmbed({
  src: 'https://example.com/embed/video',
  title: 'Vertical Video',
  aspectRatio: '9/16'  # For vertical/portrait videos
}) }}
```

Other common ratios:

- `16/9` - Standard widescreen (default)
- `4/3` - Classic TV format
- `21/9` - Ultra-wide
- `1/1` - Square

## Accessibility

The video embed component follows accessibility best practices:

- **ARIA labels**: Each video has proper `aria-label` and `title` attributes
- **Keyboard navigation**: Play buttons are keyboard accessible (Enter/Space to activate)
- **Screen readers**: Proper semantic markup and alternative text
- **Transcripts**: Optional expandable transcripts for deaf/hard-of-hearing users
- **Captions**: Encourage use of videos with built-in captions when possible

## Best Practices

### Content Selection

1. **Choose relevant videos**: Only embed videos that directly enhance understanding of the topic
2. **Keep it concise**: Prefer videos under 10-15 minutes for better engagement
3. **Quality matters**: Use high-quality videos from reputable sources
4. **Check permissions**: Ensure you have rights to embed the video

### Placement

1. **Strategic positioning**: Place videos where they add most value (after introducing a concept, before a hands-on section)
2. **Don't overload**: Limit to 1-2 videos per page to avoid overwhelming users
3. **Complement, don't replace**: Videos should supplement written content, not replace it

### Video Metadata

Always provide:

- **Title**: Clear, descriptive title
- **Description**: Brief explanation of what the video covers
- **Caption**: Attribution, context, or key takeaways

### Example Video Placement

```njk
<section>
  <h2>Understanding Log-Based CDC</h2>
  <p>
    Log-based CDC reads directly from database transaction logs, providing
    low-latency capture with minimal performance impact.
  </p>

  {{ youtubeEmbed('VIDEO_ID', {
    title: 'Log-Based CDC Explained',
    description: 'Visual walkthrough of how database logs are parsed and transformed into change events.',
    caption: 'Learn how Debezium implements log-based CDC for PostgreSQL.'
  }) }}

  <p>
    Now that you understand the theory, let's walk through a practical implementation...
  </p>
</section>
```

## Performance Considerations

The video embed component is optimized for performance:

- **Lazy loading**: Videos don't load until clicked (when using thumbnails)
- **Lightweight**: No heavy JavaScript libraries required
- **Responsive images**: Thumbnails use proper `loading="lazy"` attribute
- **CDN delivery**: YouTube/Vimeo videos are served from their respective CDNs

## Examples in the Codebase

Check these files for real examples:

- `src/intro/index.njk` - Introduction to CDC overview video
- `src/tooling/index.njk` - Debezium tutorial video
- `src/quickstart/quickstart-postgres/index.njk` - PostgreSQL setup walkthrough

## Troubleshooting

### Video doesn't load

1. Check that the video ID is correct
2. Verify the video is publicly accessible (not private/unlisted)
3. Check browser console for errors

### Thumbnail not showing

1. For YouTube: the video must be public and have a thumbnail
2. For custom thumbnails: verify the image path is correct
3. Check that the image file exists in `src/static/` or appropriate directory

### Aspect ratio looks wrong

1. Verify the `aspectRatio` parameter matches your video
2. Test on different screen sizes
3. Check for conflicting CSS rules

## Technical Details

### Files

- **Component**: `src/_includes/components/video-embed.njk`
- **Styles**: `src/assets/css/08-video-embed.css`
- **JavaScript**: `src/assets/js/video-embed.js`

### Browser Support

The video embed component works in all modern browsers:

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

### Fallbacks

- CSS `aspect-ratio` is used with automatic fallback for older browsers
- JavaScript gracefully degrades if disabled
- Videos work without JavaScript (thumbnails won't click-to-play)

## Contributing

When adding video embeds:

1. Test on mobile, tablet, and desktop
2. Verify keyboard navigation works
3. Check that videos don't slow down page load
4. Ensure captions/transcripts are available when possible
5. Run smoke tests: `npm run smoke`

## Questions?

If you encounter issues or have suggestions for improving the video embed component, please:

1. Check the [GitHub Issues](https://github.com/sandgraal/letstalkcdc/issues)
2. Review existing video embeds for patterns
3. Open a new issue with details about your use case
