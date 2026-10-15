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
3. Set up [StashDB](./stashdb) and [ThePornDB](./xxx-movies), then [Whisparr](./whisparr), and optionally [Stash](./stash).

Users without the permission never see adult titles: scene pages show "not found", and adult movies, scenes and their requests are left out of search, discover, request lists and media lists.

## Browsing

Users with access get two sidebar tabs that work like **Movies** and **Series**: a grid with sorting and a **Filters** panel. **Scenes** sorts by popularity (the default), release date, date added to StashDB, duration and title, each either way, and by StashDB's trending order. Performer and studio pages show their scenes and XXX movies in rows, newest first; a row's title opens the tab to sort or filter them.

- **XXX Movies** filters by release date, studio, performers and tags from ThePornDB.
- **Scenes** filters by release date, studios, performers and tags from StashDB.

Both also leave out studios, performers and tags picked under **Exclude**, and **And** / **Or** sets whether titles need all of the picked performers or tags, or any. Different filters always add up: a title needs the picked performers, and the studio, and the tags. Studios and sexual preferences are either-or: a title needs one of them, not all. ThePornDB filters by one studio at a time. Once something is picked, suggestions for the other fields leave out anything that would find no title next to it; for XXX movies only the first ten suggestions are checked, as ThePornDB allows few requests.

**Sexual Preferences** shows straight, lesbian, bisexual or gay titles, and those with trans performers or futanari, like the filter adult sites offer. StashDB's orientation tags decide where a scene has them, adding straight where a woman and a man are both in it, so a lesbian-tagged scene with a man in it is straight and lesbian; otherwise its cast does: women and men are straight, two or more women lesbian, men alone gay, a lone woman both straight and lesbian, and any trans performer trans. StashDB's "Missing Performer" tags and group tags like "Threesome (BGG)" count toward the cast, so a scene with only its male performer listed is not taken for a gay one, and a BGG threesome with only its women listed not for a lesbian one. XXX movies use ThePornDB's tags and cast the same way. Bisexual and futanari are known from tags only. Titles nothing is known about count as **Unidentified**, which has a pick of its own and shows next to any other pick. At least one sexual preference stays picked. Without straight, the lists ask for titles tagged with a picked orientation, together with the picked tags where StashDB or ThePornDB allows it, as filtering the others out would leave pages nearly empty; where they can't, pages read 100 scenes or 60 movies at a time. Scene and XXX movie cards show the sexual preferences a title suits as letters under the type badge (S, L, B, G, T, F), named on hover, and pages spell them out.

Each user picks which sexual preferences are on by default in their **General** settings. Admins can take some away from a user under **Allowed Sexual Preferences**, the same way they set request limits; those never show for that user, not even in search or recommendations.

Search shows matching scenes in a row above the regular results. XXX movies and performers join the regular results: StashDB's first, then ThePornDB's. A ThePornDB performer that links to a StashDB performer opens the StashDB page, and is left out when that performer is already listed; the rest are marked ThePornDB and open their ThePornDB page. Adult TMDB movies carry an **XXX** badge instead of the movie one.

Scene and XXX movie cards work like movie cards: hover one for its details and the **Request**, watchlist and blocklist buttons. Scenes and XXX movies can be added to the watchlist and the blocklist from their cards and pages, and show up on the Watchlist and Blocklist pages for users with the **Adult Content** permission.

### Discover Rows

The Discover page gets adult rows at the bottom: trending, popular, new and upcoming scenes; new and upcoming XXX movies; and **Studios** and **Networks**, the studios behind the scenes trending on StashDB. Their titles and **See All** cards open every StashDB studio or network, searchable by name; the Studios list leaves out networks. These lists start out like the rows, by trending, and also sort by popularity, name or newest. StashDB can't rank studios itself, so trending and popularity count each studio's scenes among the top 5,000 trending or popular ones; studios without any there are only listed by name or newest. A network's page links to all its studios the same way. Recently Added gets a row of its own for scenes, and Recent Requests includes scene and XXX movie requests. Admins can reorder or hide them in the Discover editor like any other row. Users without adult access never see them.

## Scenes

Scenes are their own media type, separate from movies and series.

Each scene page shows the StashDB details, the cast (with a **Full Cast** page) and tags. Performer and studio pages list their scenes in a row; the **Scenes** title opens the Scenes tab filtered to them. Their links to StashDB, ThePornDB and the sites StashDB knows about show as StashDB's icon for the site, or a logo where StashDB has no icon, or by name for sites without either. Performers get a ThePornDB link when their ThePornDB profile links back to them on StashDB, and studios when ThePornDB has a site of the same name, unless StashDB lists one already. A network's page also lists its studios and the scenes of all of them. With a ThePornDB key, these pages add an **XXX Movies** row and button, which opens the ThePornDB page of the performer or studio. Studios are matched on their name, performers on the StashDB link ThePornDB keeps for them, the same link Whisparr relies on.

### Detail Pages

Scene and XXX movie pages are laid out like movie pages:

- A **More from** banner for the studio, like the collection banner on movies, opens the studio's titles.
- **Recommendations** lists other titles with any of the same performers. For scenes these are the most popular on StashDB; for XXX movies, the newest released on ThePornDB.
- **Similar** looks at content rather than people. For scenes, Seerr takes the 100 most popular StashDB scenes sharing at least one tag and ranks them by how many tags they share (top 40). For XXX movies it uses ThePornDB's own similar list, about 9 movies.
- The links at the bottom of the facts table open the title on Stash, StashDB, ThePornDB or the studio's site. Sites StashDB has an icon for show it alone, named on hover.
- XXX movie pages add a **Scenes** row: the StashDB scenes the movie is cut into, found by the file fingerprints and studio pages ThePornDB keeps for its scenes.
- Status badges open the **Manage** panel. Once a title is available, users who can create issues get the **Report an Issue** button. Issues for scenes and XXX movies work like movie issues, and only users with adult access see them.

### Requesting Scenes

Scene requests use the normal **Request** permission and go through the normal approval flow: users with **Auto-Approve** or **Manage Requests** are approved immediately, everyone else waits for approval. Scenes have no 4K tier.

Request managers and users with **Advanced Requests** can pick the Whisparr server, quality profile, root folder and tags in the request window.

### Scene Quotas

Scenes have their own request limit, next to the movie and series limits. Set the default under **Settings &rarr; Users &rarr; Global Scene Request Limit**, or override it for a user in their **General** settings. Request managers can bypass it per request.

## XXX Movies

XXX movies come from ThePornDB. See [XXX Movies](./xxx-movies). Requests for them go to Whisparr and count against the movie quota.

Adult movies from TMDB also show up in the regular search for users with the **Adult Content** permission. When a default Whisparr server is set up, requests for them are sent to Whisparr instead of Radarr, unless Radarr already manages the movie.

## Safe Mode and Blurred Artwork

Users with adult access get two switches in their user menu:

- **Safe Mode** hides all adult content at once, for example while sharing a screen. Seerr treats the user as having no adult access until it is turned off again; the permission itself is kept. For admins it also hides the adult settings: **Enable Adult Content**, the Stash tab, the Whisparr servers, the StashDB and ThePornDB providers, the Adult Content permission, scene request limits and sexual preferences.
- **Blur Adult Artwork** blurs scene stills, XXX movie covers and adult TMDB posters until the pointer is over them.
