# Amazon Now-Playing Download Button Design

## Goal

Show the Tidal Quick Queue download button in the Amazon Music now-playing bar, immediately after the favorite button and before the context-menu button.

## Scope

- Change only the Amazon Music now-playing button placement.
- Preserve existing per-track row buttons and queue behavior.
- Reuse the app's current download method, format, and output folder through the existing local queue API.
- Do not add a second now-playing button or alter Amazon's native controls.

## DOM Placement

The content script identifies native controls by stable custom-element attributes rather than generated CSS class names:

- Favorite anchor: `music-button[icon-name="favorite"]`
- Context-menu anchor: `music-button[icon-name="more"]`

The extension inserts a dedicated now-playing button container immediately before the context-menu container. This produces the order:

1. Favorite
2. Download
3. Context menu

If either native control or their shared parent is unavailable, the script does not use a visual fallback. The existing mutation observer retries after Amazon renders or replaces the player controls.

## Components

### Now-Playing Target Resolution

`upsertButtonForAmazonNowPlaying` continues to resolve the current Amazon track URL through `resolveAmazonNowPlayingUrl`. It then locates the favorite and context-menu controls and verifies that they belong to the same control group.

### Button Insertion

A now-playing-specific helper creates or updates one button with both the shared inline-button class and a dedicated now-playing class. The helper inserts the button before the context-menu container, which places it to the right of the favorite control.

The dedicated class prevents the row-button lookup from accidentally satisfying the now-playing lookup.

### Dynamic Updates

When Amazon changes songs or rebuilds the player DOM:

- An existing connected now-playing button receives the latest canonical track URL.
- A removed button is recreated in the new control group.
- Duplicate now-playing buttons are not created.

## Interaction Flow

1. The content script resolves the active Amazon track URL.
2. It places or updates the now-playing download button between favorite and context menu.
3. The document-level capture listener handles the click.
4. The extension background worker posts the canonical track URL to the existing local queue API.
5. The button shows its existing busy state and the existing toast reports success or failure.

## Error Handling

- Missing current-track URL: do not render or update the button during that scan.
- Missing native controls: wait for a later mutation-observer scan.
- Extension or local API failure: preserve the existing error toast behavior.
- Repeated clicks while a request is active: preserve the existing disabled-button guard.

## Testing

Automated tests will verify:

- The now-playing helper anchors on `favorite` and `more`, not generated CSS classes.
- The button is inserted before the context-menu container, placing it after favorite.
- The now-playing button has a dedicated selector and is updated rather than duplicated.
- Existing Amazon URL normalization and delegated-click regression tests continue to pass.
- The extension content script passes JavaScript syntax validation.
- The Electron application production build still succeeds.

Manual verification requires reloading the unpacked extension, opening Amazon Music, starting a track, and confirming that clicking the new button increases the local app queue by one.
