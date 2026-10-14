---
title: Stash
description: Use Stash as a companion library for scenes.
sidebar_position: 5
---

# Stash

[Stash](https://github.com/stashapp/stash) can act as a library for scenes, much like Plex or Jellyfin for movies and series. It is optional: without it, scenes become available when Whisparr has downloaded them.

Stash does not handle sign-in. Users still sign in with your main media server or local accounts.

## Setup

Go to **Settings &rarr; Services &rarr; Stash**.

#### URL

The address Seerr uses to reach Stash, for example `http://stash:9999`.

#### API Key

Generate one in Stash under **Settings &rarr; Security &rarr; Authentication**.

#### External URL

Optional. Used for **Play on Stash** links when the URL above is not reachable from your browser.

Use **Test** to check the connection before saving.

## How It Works

- The **Stash Scan** job (every 15 minutes, see **Settings &rarr; Jobs & Cache**) reads every Stash scene that is linked to your stash-box endpoint and marks it available in Seerr. Pending requests for those scenes are completed.
- Only scenes that Stash has identified against the same stash-box instance as Seerr (for example StashDB) can be matched. Run Stash's **Identify** or **Scene Tagger** first if scenes are missing.
- Available scenes get a **Play on Stash** button on their page, request rows and request cards.
- **Availability Sync** marks a scene as deleted only when it is gone from Stash and its file is gone from Whisparr. If Stash cannot be reached, nothing is changed.
