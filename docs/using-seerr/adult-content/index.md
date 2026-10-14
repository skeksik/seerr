---
title: Overview
description: How adult scenes and movies work in Seerr.
sidebar_position: 1
---

# Adult Content Overview

Seerr can browse and request adult content alongside movies and series. It is off by default and stays invisible to everyone until you turn it on.

These integrations work together:

| Integration                     | Role              | What it does                                                                        |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| [StashDB](./stashdb)            | Metadata provider | Supplies scenes, performers, studios and tags. Scenes are identified by StashDB id. |
| [ThePornDB](./xxx-movies)       | Metadata provider | Supplies XXX movies (the default source; TMDB studios can be used instead).         |
| [Whisparr](./whisparr)          | Service           | Downloads requested scenes and XXX movies (Whisparr v3 only).                       |
| [Stash](./stash) (optional)     | Companion library | Marks scenes available once Stash has them, and links to them for playback.         |

## Enabling Adult Content

1. In **Settings &rarr; General**, turn on **Enable Adult Content**.
2. Give the **Adult Content** permission to each user who should see it (**Users &rarr; Edit &rarr; Permissions**). Admins have access automatically.
3. Set up [StashDB](./stashdb), the [XXX movie source](./xxx-movies), then [Whisparr](./whisparr), and optionally [Stash](./stash).

Users without the permission never see adult titles: scene pages show "not found", and adult movies, scenes and their requests are left out of search, discover, request lists and media lists.

## Browsing

Users with access get two sidebar tabs that work like **Movies** and **Series**: a grid with sorting and a **Filters** panel.

- **XXX Movies** filters by release date, studio, performer and tags (ThePornDB) or by release date and studio (TMDB).
- **Scenes** filters by release date, studios, performers and tags from StashDB.

Search shows matching scenes and XXX movies above the regular results. Adult TMDB movies carry an **XXX** badge instead of the movie one.

### Discover Rows

The Discover page gets adult rows at the bottom: trending, popular, new and upcoming scenes; new and upcoming XXX movies (plus popular ones with the TMDB source); and **Trending Studios** and **Trending Networks**, the studios behind the scenes trending on StashDB. Admins can reorder or hide them in the Discover editor like any other row. Users without adult access never see them.

## Scenes

Scenes are their own media type, separate from movies and series.

Each scene page shows the StashDB details, performers, tags and more scenes from the same studio. Performer and studio pages list their scenes, with links to StashDB and the sites StashDB knows about. A network's page also lists the scenes of the studios under it. With a ThePornDB key, these pages add an **XXX Movies** row: performers are matched on their StashDB link, studios on their name.

### Requesting Scenes

Scene requests use the normal **Request** permission and go through the normal approval flow: users with **Auto-Approve** or **Manage Requests** are approved immediately, everyone else waits for approval. Scenes have no 4K tier.

Request managers and users with **Advanced Requests** can pick the Whisparr server, quality profile, root folder and tags in the request window.

### Scene Quotas

Scenes have their own request limit, next to the movie and series limits. Set the default under **Settings &rarr; Users &rarr; Global Scene Request Limit**, or override it for a user in their **General** settings. Request managers can bypass it per request.

## XXX Movies

XXX movies come from ThePornDB by default, or from TMDB. See [XXX Movies](./xxx-movies). Requests for them go to Whisparr and count against the movie quota.

Adult movies from TMDB also show up in the regular search for users with the **Adult Content** permission. When a default Whisparr server is set up, requests for them are sent to Whisparr instead of Radarr, unless Radarr already manages the movie.

## Safe Mode and Blurred Artwork

Users with adult access get two switches in their user menu:

- **Safe Mode** hides all adult content at once, for example while sharing a screen. Seerr treats the user as having no adult access until it is turned off again; the permission itself is kept.
- **Blur Adult Artwork** blurs scene stills, XXX movie covers and adult TMDB posters until the pointer is over them.
