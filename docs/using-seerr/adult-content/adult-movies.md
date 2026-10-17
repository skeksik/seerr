---
title: Adult Movies
description: List adult movies from ThePornDB.
sidebar_position: 3
---

# Adult Movies

Adult movies are full-length releases, as opposed to single scenes. They come from [ThePornDB](https://theporndb.net), which lists adult movies with covers, performers, studios and tags.

## Setup

Go to **Settings &rarr; Metadata Providers**. The **Adult Content** section shows while adult content is enabled.

- **ThePornDB API URL** is ThePornDB's REST API, `https://api.theporndb.net`. ThePornDB's GraphQL endpoint (`https://theporndb.net/graphql?type=Movie`) is made for Stash's scrapers: it finds movies by id or name, but returns nothing when asked for a list, so it can't power the Adult Movies tab, its filters or the Discover rows.
- **ThePornDB API Key**: create one under your profile on theporndb.net.

**Test** checks every provider on the page, and **Save Changes** saves them all.

## How It Works

- Adult movies are keyed by their ThePornDB id, the same id Whisparr uses for movies it lists from ThePornDB. The **Whisparr Scan** matches them, so movies Whisparr already monitors show their status in Seerr.
- The **Adult Movies** tab sorts by release date, date added to ThePornDB or duration, each either way. ThePornDB has no popularity order. Some ThePornDB durations are far off, like hundreds of hours; Seerr leaves out anything over 24 hours, and duration sorts skip those movies.
- It filters by release date, one studio (ThePornDB takes a single site per query; networks include their sites), any number of performers (a movie must feature all of them) and tags.
- Release dates in the future are often placeholders on ThePornDB, so the default list stops at today. **Upcoming Adult Movies** on Discover shows the rest.
- Movies with a trailer on ThePornDB show **Watch Trailer**, like a movie's, which plays the studio's video file on a page of its own in a new tab (studios' servers send them as downloads, so they are not opened directly). Only a few percent of movies have one. Streaming playlists (`.m3u8`), which only Safari plays, and signed links that have expired are left out; some studios have also taken their old trailers down, which Seerr can't tell beforehand.
- The cast and the studio open the StashDB performer's or studio's page at `/performer/[id]` or `/studio/[id]` when StashDB or ThePornDB links them, which adds their adult movies to their scenes. Performers and studios neither links are shown without a link, like the crew. See [Performers and Studios](/using-seerr/adult-content#performers-and-studios).

## Images

Adult movie covers are served from ThePornDB's CDN. With **Cache Images** turned on in **Settings &rarr; General**, they are cached like TMDB images.
