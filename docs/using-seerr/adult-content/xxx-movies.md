---
title: XXX Movies
description: List XXX movies from ThePornDB or from adult studios on TMDB.
sidebar_position: 3
---

# XXX Movies

XXX movies are full-length adult releases, as opposed to single scenes. Go to **Settings &rarr; Metadata Providers &rarr; XXX Movies** to choose where they come from.

## ThePornDB (default)

[ThePornDB](https://theporndb.net) lists adult movies with covers, performers, studios and tags. Enter a **ThePornDB API Key**; you can create one under your profile on theporndb.net.

- XXX movies are keyed by their ThePornDB id, the same id Whisparr uses for movies it lists from ThePornDB. The **Whisparr Scan** matches them, so movies Whisparr already monitors show their status in Seerr.
- The **XXX Movies** tab sorts by release date, date added to ThePornDB or duration. ThePornDB has no popularity order.
- It filters by release date, one studio (ThePornDB takes a single site per query; networks include their sites), any number of performers (a movie must feature all of them) and tags.
- Release dates in the future are often placeholders on ThePornDB, so the default list stops at today. **Upcoming XXX Movies** on Discover shows the rest.

## TMDB

TMDB has adult movies but cannot list them on their own. With **The Movie Database (TMDB)** as the source, Seerr lists the movies of the studios in **TMDB Studios** instead, and keeps only those TMDB flags as adult.

- **Import from Whisparr** adds the TMDB companies of the studios your default Whisparr server knows.
- These movies are regular TMDB movies with an **XXX** badge. Requests for them go to Whisparr when a default Whisparr server is set up.
- The tab sorts by popularity, release date or title, and filters by release date and studio.

A ThePornDB key is still used for direct links to ThePornDB movies when it is set.

## Images

XXX movie covers are served from ThePornDB's CDN. With **Cache Images** turned on in **Settings &rarr; General**, they are cached like TMDB images.
