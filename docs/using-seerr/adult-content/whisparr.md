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

Request managers see **Monitor in Whisparr** on performer and studio pages when a default Whisparr server is set up; see [Performers and Studios](/using-seerr/adult-content#performers-and-studios). The button opens a dialog with what Whisparr monitors of them, pre-filled from Whisparr when it follows them already:

- **Monitor scenes**: Whisparr adds every one of their scenes from StashDB.
- **Monitor movies**: Whisparr adds every one of their movies. Whisparr takes movies from the movie metadata source in its general settings (ThePornDB or TMDB) and finds a performer's or studio's movies by the link to that source on their StashDB profile alone. The option is disabled, with a note, when the StashDB profile (or, for a network, none of the picked studios' profiles) links ThePornDB. Adding the link on StashDB enables it; Whisparr picks the link up on its next refresh of them. Where the link exists but Whisparr cannot use it (its metadata source is TMDB, or it has not read the link yet), Whisparr monitors scenes only, and the button shows **Scenes Monitored**.
- **Monitor new items**: new scenes and movies are added monitored and downloaded as they are released. Unchecked, Whisparr adds them to its library unmonitored, for picking by hand. On by default.
- **Search for existing titles now**: makes Whisparr search for every scene and movie it adds that is not downloaded yet. Off by default, because it can queue a large number of downloads at once.

**Save** applies the options; **Stop Monitoring** turns scenes and movies off. Titles that were already added stay in Whisparr. Whisparr adds the titles with the default server's quality profile, root folder and tags, on the refresh Seerr starts, or, if it is still busy adding a large back catalog, on its next daily refresh. For a performer or studio it does not follow yet, Seerr adds them first and turns on their movies once Whisparr has read the link.

### Networks

Whisparr lists scenes under the studio that released them, so following a network such as Adult Time or Vixen Media Group holds no scenes by itself: each of its studios has to be followed. A network's dialog therefore adds a **Studios** list, one checkbox per studio under it on StashDB, with **Select all** / **None** and a ThePornDB marker on the studios whose StashDB profile links it. The studios Whisparr follows already come checked. **Save** and **Stop Monitoring** apply the options above to the network and to every checked studio, two at a time; a studio Whisparr refuses is reported and does not stop the others. Unchecked studios are left as they are.

### The Button

The button shows what Whisparr monitors of the performer or studio itself: **Monitored in Whisparr** for scenes and, where possible, movies; **Scenes Monitored** or **Movies Monitored** when only one of them is, for example after monitoring in Whisparr itself or before this option existed. For a network it shows the network's own entry, not its studios'. Clicking it in any state opens the dialog.

A note above the titles says when Whisparr can monitor a performer's or studio's scenes only: the page is linked to ThePornDB the other way around, by the ThePornDB performer's StashDB link, and Whisparr reads the StashDB profile's own links alone. Adding the ThePornDB link to the StashDB profile fixes it, and the note goes once Whisparr says so. The note only shows to request managers with a Whisparr server set up; a network's page has none, as its monitoring goes by its studios' links, which the dialog shows.

Whisparr follows performers and studios by their StashDB id only, and cannot add one from ThePornDB, so a performer or studio only ThePornDB knows cannot be monitored.
