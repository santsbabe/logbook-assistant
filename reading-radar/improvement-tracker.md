# Reading Radar Improvement Tracker

Stable baseline published after restoring the recovered master roadmap.

## Deferred improvements

### 1. Source more books from established tastes and preferences
Status: Next action

Investigate a reliable discovery method that can feed Reading Radar with genuinely new titles based on the user's existing reading history and preferences.

Inputs to consider:
- Loved / liked / fine / nope review signals
- Reread signals
- DNF and No / do-not-recommend records
- Favourite authors
- Genres, moods and roadmap lanes
- Existing queue choices
- Reader-overlap / "people who loved X also loved Y" signals
- Author similarity
- Thematic similarity
- Critic and community lists
- Library / catalogue metadata
- Deliberate wildcard discovery

Constraint: avoid simply repeating obvious bestsellers or endlessly recommending more books by authors already heavily represented.

### 2. Time spent reading tracker
Status: Deferred until after discovery investigation

Desired behaviour:
- Start reading / stop reading timer tied to a selected book
- Manual time entry for sessions logged after the fact
- Per-book total reading time
- Today / this week / this month summaries
- Preserve raw session history
- Optional streaks only if they are useful rather than guilt-inducing
- Later investigate an iPhone-friendly shortcut / live activity style flow so the app does not need to stay open


### 3. Sync app state across devices
Status: Deferred

Move user-specific Reading Radar state out of browser-local storage into a persistent synced store so it survives browser-data clearing and follows the user across devices.

State to sync:
- Manual cover assignments
- Queue order
- Reading status changes
- Reviews and reread signals
- Added books
- Future reading-time sessions
- Future discovery preferences / exclusions

Current limitation:
- These items are presently stored in local browser storage on the device where they were entered.

Desired outcome:
- Changes made on one device are available on another.
- State survives browser cache/site-data clearing.
- The roadmap itself remains stable and separate from personal activity state.
