---
title: Whisparr
description: Send scene and adult movie requests to Whisparr.
sidebar_position: 4
---

# Whisparr

Approved scene and adult movie requests are sent to [Whisparr](https://github.com/whisparr/whisparr-eros). Movies from TMDB, adult or not, go to Radarr.

:::warning
**Only Whisparr v3 (Eros) is supported.** Whisparr v2 uses a different API and is rejected when you test the connection.
:::

## Setup

Go to **Settings &rarr; Services &rarr; Whisparr Settings** and add a server. The fields match the [Radarr and Sonarr settings](/using-seerr/settings/services), with a few notes:

- Mark one server as **Default Server**. Without one, scene and adult movie requests are not processed.
- **4K Server** works like it does for Radarr: a default server marked 4K takes 4K scene and adult movie requests, and turns on 4K requests for them (see [4K](./index.md#4k)). The Whisparr Scan reads a 4K server's titles as their 4K versions.
- **Enable Automatic Search** makes Whisparr search as soon as a request is approved. Turn it off if you prefer Whisparr's RSS sync to pick releases up.
- **Tag Requests** adds a tag with the requester's user id and name in Whisparr.
- **External URL** is used for "Open in Whisparr" links when the hostname is not reachable from your browser.

## What Seerr Does in Whisparr

- **Requests**: Seerr looks the scene up by StashDB id (or the movie by ThePornDB id) on the default server, or the default 4K server for 4K requests, then adds it monitored with the chosen quality profile, root folder and tags. If Whisparr already lists the item unmonitored, for example because it follows the performer, Seerr monitors it instead of adding a duplicate.
- **Whisparr Scan** (daily at 04:45 on new installs, before the availability sync; see **Settings &rarr; Jobs & Cache**): tracks scenes and adult movies the way the Radarr Scan tracks movies, whether they were requested through Seerr or added in Whisparr directly, for example by a monitored performer or studio. Monitored titles without a file show as **Requested** (processing), without a request of their own, so they don't appear under Requests; titles with a file become **Available** and join Recently Added, dated by their Whisparr file. An available title stays available until the availability sync says otherwise, and a deleted one that Whisparr searches for again stays deleted until its file is back. Request managers reach Whisparr through the cog on scene and movie pages. Movies with a ThePornDB id are adult movies; Whisparr movies without one are left to Radarr. Unmonitored items are not listed, since Whisparr often holds tens of thousands of them; like Radarr's unmonitored movies without a file, they stay out of Seerr.
- **Removed and unmonitored titles**: like the Radarr Scan, the Whisparr Scan resets titles that are still processing but that Whisparr no longer has, or has unmonitored with nothing downloaded, to no status, and declines their approved requests, so they can be requested again. Titles it did not see are looked up on each server: one that is unmonitored but has its file is marked available instead, and one Whisparr can't answer for is left alone. This only happens once every server of the tier (4K or not) was scanned with sync enabled, and is skipped when one of them returned no monitored items at all.
- **Availability Sync** marks available scenes **Deleted** once neither Stash nor Whisparr has them, and adult movies once Whisparr no longer has their file, like movies gone from both Radarr and the media server. The 4K version is checked on its 4K server separately.
- **Download Sync** shows Whisparr download progress on requests and title pages, for 4K versions too.
- **Remove from Whisparr** on a request deletes the item and its files from Whisparr, from the 4K server for 4K versions.

## Override Rules

[Override rules](/using-seerr/settings/services) can target a Whisparr server. For scenes only the **Users** condition applies, since scenes have no TMDB genres, languages or keywords. Rules with those conditions only match adult movies.

## Monitoring Performers and Studios

Request managers see **Monitor in Whisparr** on StashDB performer and studio pages when a default Whisparr server is set up. ThePornDB performers and studios linked to StashDB ones share their page, and with it the button; see [Performers and Studios](/using-seerr/adult-content#performers-and-studios).

Monitoring a performer or studio makes Whisparr add every one of their scenes and download new scenes as they are released. It uses the default server's quality profile, root folder and tags. **Search for existing scenes now** is off by default, because it can queue a large number of downloads at once.

**Stop Monitoring** turns monitoring off in Whisparr. Scenes that were already added stay in Whisparr.
