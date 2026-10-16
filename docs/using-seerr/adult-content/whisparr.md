---
title: Whisparr
description: Send scene and adult movie requests to Whisparr.
sidebar_position: 4
---

# Whisparr

Approved scene, adult movie and adult TMDB movie requests are sent to [Whisparr](https://github.com/whisparr/whisparr-eros).

:::warning
**Only Whisparr v3 (Eros) is supported.** Whisparr v2 uses a different API and is rejected when you test the connection.
:::

## Setup

Go to **Settings &rarr; Services &rarr; Whisparr Settings** and add a server. The fields match the [Radarr and Sonarr settings](/using-seerr/settings/services), with a few notes:

- Mark one server as **Default Server**. Without one, scene and adult movie requests are not processed.
- **Enable Automatic Search** makes Whisparr search as soon as a request is approved. Turn it off if you prefer Whisparr's RSS sync to pick releases up.
- **Tag Requests** adds a tag with the requester's user id and name in Whisparr.
- **External URL** is used for "Open in Whisparr" links when the hostname is not reachable from your browser.

## What Seerr Does in Whisparr

- **Requests**: Seerr looks the scene up by StashDB id (or the movie by ThePornDB or TMDB id), then adds it monitored with the chosen quality profile, root folder and tags. If Whisparr already lists the item unmonitored, for example because it follows the performer, Seerr monitors it instead of adding a duplicate.
- **Whisparr Scan** (daily at 04:45 on new installs, before the availability sync; see **Settings &rarr; Jobs & Cache**): links monitored scenes and movies to Whisparr and marks them available once Whisparr has their file. Only titles requested through Seerr show as requested; the rest, for example everything a monitored performer or studio adds, stay requestable and out of Recently Added, like a series Sonarr follows. Request managers reach Whisparr through the cog on scene and movie pages. Movies with a ThePornDB id become adult movies, unless Seerr already tracks them as adult TMDB movies. Unmonitored items are skipped, since Whisparr often lists tens of thousands of them.
- **Download Sync** shows Whisparr download progress on requests and title pages.
- **Remove from Whisparr** on a request deletes the item and its files from Whisparr.

## Override Rules

[Override rules](/using-seerr/settings/services) can target a Whisparr server. For scenes only the **Users** condition applies, since scenes have no TMDB genres, languages or keywords. Rules with those conditions only match adult movies.

## Monitoring Performers and Studios

Request managers see **Monitor in Whisparr** on performer and studio pages when a default Whisparr server is set up.

Monitoring a performer or studio makes Whisparr add every one of their scenes and download new scenes as they are released. It uses the default server's quality profile, root folder and tags. **Search for existing scenes now** is off by default, because it can queue a large number of downloads at once.

**Stop Monitoring** turns monitoring off in Whisparr. Scenes that were already added stay in Whisparr.
