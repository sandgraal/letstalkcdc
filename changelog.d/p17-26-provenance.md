type: Added

**Review provenance line (P17-26).** A page can now set `reviewedBy` and `reviewedOn` in its front matter; only when both are set does the page footer show "Technically reviewed by NAME on DATE" and the Article JSON-LD declare `reviewedBy`. No page sets them yet. The footer date, which used to read "Last reviewed" even when an edit (not a review) moved `dateModified`, now reads "Last updated".
