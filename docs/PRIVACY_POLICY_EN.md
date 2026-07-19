# Privacy Policy

**Last Updated**: July 2026

## 1. Data Collection

This Chrome extension "Chrome Bookmark List" respects user privacy and is committed to protecting personal information.

### Data We Access

This extension accesses the following data:

- **Bookmark Data**: For displaying, editing, deleting, and moving bookmarks stored in your browser
- **Browsing History**: For the history tab (past 7 days) and calendar tab (current month)
- **Recently Closed Tabs**: For displaying the list of recently closed tabs and restoring them on click (via `chrome.sessions.getRecentlyClosed`; up to approximately 25 entries). Synced device sessions (`getDevices`) are never accessed.
- **Closed Tab URL and Title**: Required to display the URL and title of recently closed tabs returned by the sessions API. This permission is not used to monitor or read the content of open tabs.
- **Website Favicons**: Retrieved locally via Chrome's internal `_favicon` API (`chrome.runtime.getURL('/_favicon/...')`). No external network requests are made; hostnames are not exposed to any external service.

### Purpose of Data Usage

The accessed data is used solely for the following purposes:

- Organized display, search, editing, and management of bookmarks
- Search and display of browsing history
- Display and one-click restoration of recently closed tabs
- Enhancement of user experience

## 2. Data Storage and Processing

### Local Processing

- **All data is processed locally**
- No data is transmitted to external servers
- No internet connection required (works offline)

### Data Storage

- This extension does not use `chrome.storage` or create its own database
- Only reads existing bookmark, history, and session data from your browser
- No settings, folder expansion states, or favicon caches are stored by the extension

## 3. Third-Party Sharing

This extension does NOT:

- Share data with third parties
- Send data to external services
- Use analytics tools
- Connect to advertising networks

## 4. Permission Explanations

Permissions required by this extension and their purposes:

### Required Permissions

- **bookmarks**: Reading, displaying, editing, deleting, and moving bookmarks
- **history**: Reading and displaying browsing history in the history tab and calendar tab
- **tabGroups**: Opening bookmark folders as tab groups
- **favicon**: Accessing Chrome's internal `_favicon` API to display favicons locally (no external communication)
- **sessions**: Retrieving the list of recently closed tabs (`getRecentlyClosed`, up to approximately 25 entries) and restoring a selected tab to its original position (`restore`). Synced device sessions (`getDevices`) are never accessed.
- **tabs**: Required for Chrome to include URL and title information in the session entries returned by the sessions API. Without this permission, Chrome strips those fields and the recently closed tabs list cannot be displayed. This permission is not used to monitor open tabs or read their content.

## 5. Security

### Security Measures

- Code is publicly available, ensuring transparency
- No external communications
- Contains no malware or spyware

### Vulnerability Response

If you discover a security vulnerability, please report it via GitHub Issues.

## 6. Children's Privacy

This extension does not knowingly collect personal information from children under 13.

## 7. Policy Changes

This privacy policy may be updated without prior notice. Important changes will be announced in the extension's update notes.

## 8. Contact

For privacy-related questions or concerns, please contact us via GitHub Issues (https://github.com/hidekingerz/chrome-bookmark-list/issues).

## 9. Governing Law

This privacy policy is governed by the laws of Japan.

---

**Important**: This extension is completely open source. The source code is publicly available on GitHub, allowing anyone to verify the functionality and privacy implementation.
