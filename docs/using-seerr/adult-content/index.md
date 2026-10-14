---
title: Overview
description: How adult scenes and movies work in Seerr.
sidebar_position: 1
---

# Adult Content Overview

Seerr can browse and request adult content alongside movies and series. It is off by default and stays invisible to everyone until you turn it on.

Three integrations work together:

| Integration                 | Role                | What it does                                                                       |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| [StashDB](./stashdb)        | Metadata provider   | Supplies scenes, performers, studios and tags. Scenes are identified by StashDB id. |
| [Whisparr](./whisparr)      | Service             | Downloads requested scenes and adult movies (Whisparr v3 only).                    |
| [Stash](./stash) (optional) | Companion library   | Marks scenes available once Stash has them, and links to them for playback.        |

## Enabling Adult Content

1. In **Settings &rarr; General**, turn on **Enable Adult Content**.
2. Give the **Adult Content** permission to each user who should see it (**Users &rarr; Edit &rarr; Permissions**). Admins have access automatically.
3. Set up [StashDB](./stashdb), then [Whisparr](./whisparr), and optionally [Stash](./stash).

Users without the permission never see adult titles: scene pages show "not found", and adult movies, scenes and their requests are left out of search, discover, request lists and media lists.

## Scenes

Scenes are their own media type, separate from movies and series. Users with access get a **Scenes** entry in the sidebar with trending, newest and popular scenes, a browse view with sorting, and scene results in search.

Each scene page shows the StashDB details, performers, tags and more scenes from the same studio. Performer and studio pages list their scenes, with links to StashDB and the sites StashDB knows about.

### Requesting Scenes

Scene requests use the normal **Request** permission and go through the normal approval flow: users with **Auto-Approve** or **Manage Requests** are approved immediately, everyone else waits for approval. Scenes have no 4K tier.

Request managers and users with **Advanced Requests** can pick the Whisparr server, quality profile, root folder and tags in the request window.

### Scene Quotas

Scenes have their own request limit, next to the movie and series limits. Set the default under **Settings &rarr; Users &rarr; Global Scene Request Limit**, or override it for a user in their **General** settings. Request managers can bypass it per request.

## Adult Movies

Adult movies from TMDB show up in search for users with the **Adult Content** permission. When a default Whisparr server is set up, requests for them are sent to Whisparr instead of Radarr, unless Radarr already manages the movie. They count against the movie quota.
