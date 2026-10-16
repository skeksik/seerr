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
| [ThePornDB](./adult-movies)       | Metadata provider | Supplies adult movies, performers and studios.         |
| [Whisparr](./whisparr)          | Service           | Downloads requested scenes and adult movies (Whisparr v3 only).                       |
| [Stash](./stash) (optional)     | Companion library | Marks scenes available once Stash has them, and links to them for playback.         |

## Enabling Adult Content

1. In **Settings &rarr; General**, turn on **Enable Adult Content**.
2. Give the **Adult Content** permission to each user who should see it (**Users &rarr; Edit &rarr; Permissions**), along with the request permissions they should have (see [Requesting Scenes and Adult Movies](#requesting-scenes-and-adult-movies)). Admins have access automatically.
3. Set up [StashDB](./stashdb) and [ThePornDB](./adult-movies), then [Whisparr](./whisparr), and optionally [Stash](./stash).

Users without the permission never see adult titles: scene pages show "not found", and adult movies, scenes and their requests are left out of search, discover, request lists and media lists.

## Browsing

Users with access get two sidebar tabs that work like **Movies** and **Series**: a grid with sorting and a **Filters** panel. Like them, they live under Discover, at `/discover/scenes` and `/discover/adultmovies`. **Scenes** sorts by popularity (the default), release date, date added to StashDB, duration and title, each either way, and by StashDB's trending order. Performer and studio pages (see [Performers and Studios](#performers-and-studios)) show their scenes and adult movies in rows, newest first; a row's title and **See More** card open the tab sorted by release date, to sort or filter them further. Rows with nothing in them are left out.

- **Adult Movies** filters by release date, studio, performers and tags from ThePornDB.
- **Scenes** filters by release date, studios, performers and tags from StashDB.

The release date compares as equal, greater, greater or equal, less, or less or equal to the picked day; neither source takes a date range.

Both also leave out studios, performers and tags picked under **Exclude**, and **And** / **Or** sets whether titles need all of the picked performers or tags, or any. Different filters always add up: a title needs the picked performers, and the studio, and the tags. Studios and sexual preferences are either-or: a title needs one of them, not all. ThePornDB filters by one studio at a time. Once something is picked, suggestions for the other fields leave out anything that would find no title next to it; for adult movies only the first ten suggestions are checked, as ThePornDB allows few requests.

**Sexual Preferences** shows straight, lesbian, bisexual or gay titles, and those with trans performers or futanari, like the filter adult sites offer. StashDB's orientation tags decide where a scene has them, adding straight where a woman and a man are both in it, so a lesbian-tagged scene with a man in it is straight and lesbian; otherwise its cast does: women and men are straight, two or more women lesbian, men alone gay, a lone woman both straight and lesbian, and any trans performer trans. StashDB's "Missing Performer" tags, group tags like "Threesome (BGG)" and point of view tags like "Male - POV" (the performer behind the camera) count toward the cast, so a scene with only its male performer listed is not taken for a gay one, and a BGG threesome with only its women listed not for a lesbian one. Adult movies use ThePornDB's tags and cast the same way. Bisexual and futanari are known from tags only. Titles nothing is known about count as **Unidentified**, which has a pick of its own and shows next to any other pick. At least one sexual preference stays picked. Without straight, the lists ask for titles tagged with a picked orientation, together with the picked tags where StashDB or ThePornDB allows it, as filtering the others out would leave pages nearly empty; where they can't, pages read 100 scenes or 60 movies at a time. Next to straight, titles tagged with the other picked orientations are read apart and joined in, so lesbian or futanari titles don't get lost among the rest. Scene and adult movie cards show the sexual preferences a title suits as letters under the type badge (S, L, B, G, T, F), named on hover; their pages spell them out under the title, boxed like a movie's certification.

Each user picks which sexual preferences are on by default in their **General** settings. Admins can take some away from a user under **Allowed Sexual Preferences**, the same way they set request limits; those never show for that user, not even in search or recommendations.

Search shows matching scenes in a row above the regular results. Adult movies and performers join the regular results: StashDB's first, then ThePornDB's. A ThePornDB performer linked to a StashDB one is left out when that StashDB performer is already among the results, and otherwise opens the StashDB page, with ThePornDB's picture. The others are marked ThePornDB and open their ThePornDB page.

Scene and adult movie cards work like movie cards: hover one for its details and the **Request**, watchlist and blocklist buttons. Scenes and adult movies can be added to the watchlist and the blocklist from their cards and pages, and show up on the Watchlist and Blocklist pages for users with the **Adult Content** permission.

### Discover Rows

The Discover page gets adult rows at the bottom: trending, popular, new and upcoming scenes; new and upcoming adult movies; and **Studios** and **Networks**, the studios behind the scenes trending on StashDB. Their titles and **See More** cards open every StashDB studio or network, searchable by name; the Studios list leaves out networks. Listed by name or searched, the Studios list also takes in ThePornDB's sites that no StashDB studio has the name of or links to, leaving out clip store channels like "Manyvids: Someone"; they open their ThePornDB page. ThePornDB can't tell networks apart or sort its sites by date, so the Networks list and the other orders stay StashDB's. These lists start out like the rows, by trending, and also sort by popularity, name or newest. StashDB can't rank studios itself, so trending and popularity count each studio's scenes among the top 5,000 trending or popular ones; studios without any there are only listed by name or newest. A network's page links to all its studios the same way. Recently Added gets a row of its own for scenes, and Recent Requests includes scene and adult movie requests. Admins can reorder or hide them in the Discover editor like any other row. Users without adult access never see them.

## Performers and Studios

Performers and studios come from two sources: StashDB, for scenes, and ThePornDB, for adult movies. Like actors at `/person/[id]`, they have one address each, whichever source they come from:

| Page | StashDB | ThePornDB |
| --- | --- | --- |
| Performer | `/performer/<StashDB UUID>` | `/performer/<ThePornDB number>` |
| Studio | `/studio/<StashDB UUID>` | `/studio/<ThePornDB site number>` |
| A network's studios or sites | `/studio/<StashDB UUID>/studios` | `/studio/<ThePornDB site number>/studios` |

StashDB ids are always UUIDs, and Seerr takes ThePornDB's numeric ids (not its UUIDs), so the two never collide.

A StashDB performer or studio and a ThePornDB one are the same when **either** links the other:

- the StashDB performer or studio lists the ThePornDB profile among its links (`theporndb.net/performers/…`, or `theporndb.net/sites/…` for studios), or
- the ThePornDB performer lists the StashDB profile among its links. ThePornDB keeps no StashDB links for sites, so studios are linked from StashDB only.

Names alone never link them. Linked performers and studios have a single page, StashDB's: its details, its links (with the ThePornDB profile), its scenes, and the ThePornDB adult movies in a row. Every link to the ThePornDB performer or studio, from adult movie casts and studios, the **More from** banner, search results, network site lists and the Studios list, opens that StashDB page instead, and the ThePornDB address forwards to it. Performers and studios neither side links keep a page on each: StashDB's with its scenes, ThePornDB's with its own details, bio and adult movies.

For example, Gal Ritchie's ThePornDB profile links her StashDB profile, so she has one page, with StashDB's details, her StashDB scenes and her ThePornDB movies. Little Dragon has a profile on both, but neither links the other, so each keeps its own page.

Links on performer and studio pages show as StashDB's icon for the site, or a logo where StashDB has no icon, or by name for sites without either. A network's page also lists its studios (or a ThePornDB network its sites) and the titles of all of them. Request managers can monitor StashDB performers and studios in Whisparr from their page; see [Whisparr](/using-seerr/adult-content/whisparr#monitoring-performers-and-studios).

ThePornDB can't be asked which performer links a StashDB id, so the StashDB page looks for it among the ThePornDB performers of the same name or first alias, and keeps any ThePornDB performer seen linking to it. Matches are kept for six hours, like other details.

## Scenes

Scenes are their own media type, separate from movies and series.

Each scene page shows the StashDB details, the cast (with a **Full Cast** page) and tags; a tag opens the Scenes tab filtered to it, newest first, as do the tags of adult movie pages in the Adult Movies tab.

### Detail Pages

Scene and adult movie pages are laid out like movie pages:

- A **More from** banner for the studio, like the collection banner on movies, opens the studio's titles.
- **Recommendations** lists other titles with any of the same performers. For scenes these are the most popular on StashDB; for adult movies, the newest released on ThePornDB.
- **Similar** looks at content rather than people. For scenes, Seerr takes the 100 most popular StashDB scenes sharing at least one tag and ranks them by how many tags they share (top 40). For adult movies it uses ThePornDB's own similar list, about 9 movies.
- The links at the bottom of the facts table open the title on Stash, StashDB, ThePornDB or the studio's site. Sites StashDB has an icon for show it alone, named on hover.
- Adult movie pages add a **Scenes** row: the StashDB scenes the movie is cut into, found by the file fingerprints and studio pages ThePornDB keeps for its scenes.
- Status badges open the **Manage** panel. Once a title is available, users who can create issues get the **Report an Issue** button. Issues for scenes and adult movies work like movie issues, and only users with adult access see them.

### Requesting Scenes and Adult Movies

Scene and adult movie requests go through the normal approval flow, and need the **Adult Content** permission next to a request permission. While adult content is enabled (and safe mode is off), the request permissions get **Scenes** and **Adult Movies** options next to **Movies** and **Series**:

| Permission           | Scenes                     | Adult Movies                     |
| -------------------- | -------------------------- | -------------------------------- |
| **Request**          | **Request Scenes**         | **Request Adult Movies**         |
| **Auto-Approve**     | **Auto-Approve Scenes**    | **Auto-Approve Adult Movies**    |
| **Auto-Request**     | **Auto-Request Scenes**    | **Auto-Request Adult Movies**    |
| **Request 4K**       | **Request 4K Scenes**      | **Request 4K Adult Movies**      |
| **Auto-Approve 4K**  | **Auto-Approve 4K Scenes** | **Auto-Approve 4K Adult Movies** |

Like for movies and series, the parent permission covers every media type and the option only its own: a user with **Request Scenes** but not **Request** can request scenes but not adult movies. Users with **Manage Requests** are always approved immediately.

Request managers and users with **Advanced Requests** can pick the Whisparr server, quality profile, root folder and tags in the request window.

#### 4K

Once a [Whisparr](./whisparr) server marked **4K** is the default 4K server, scene and adult movie pages get a **Request in 4K** option and a 4K status badge, like movie pages. 4K requests have their own status, go to the default 4K Whisparr server and need **Request 4K** or its Scenes or Adult Movies option. Without a default 4K Whisparr server, the 4K scene and adult movie permissions can't be granted.

#### Auto-Request

Scenes and adult movies live on Seerr's own watchlist rather than on Plex's. Adding one to the watchlist requests it (not in 4K, on the default Whisparr server) for users with **Auto-Request**, **Auto-Request Scenes** or **Auto-Request Adult Movies**, like the Plex watchlist sync does for movies and series. Titles that are already requested or available are left alone. If the request can't be made, for example because the user is over their quota, the title is still added to the watchlist.

### Quotas

Scenes and adult movies each have their own request limit, next to the movie and series limits; adult movie requests don't count against the movie limit. Set the defaults under **Settings &rarr; Users &rarr; Global Scene Request Limit** and **Global Adult Movie Request Limit**, or override them for a user in their **General** settings. Like the others, 4K requests count too, and request managers can bypass the limits per request. Users see what is left on their profile and in the request window.

## Adult Movies

Adult movies come from ThePornDB. See [Adult Movies](./adult-movies). Requests for them go to Whisparr and count against the adult movie quota.

Only ThePornDB movies and StashDB scenes are adult content in Seerr. Movies TMDB flags as adult are ordinary movies: they are shown, requested through Radarr, scanned and counted like any other movie, exactly as without adult content.

## Safe Mode and Blurred Artwork

Users with adult access get two switches in their user menu:

- **Safe Mode** hides all adult content at once, for example while sharing a screen. Seerr treats the user as having no adult access until it is turned off again; the permission itself is kept. For admins it also hides the adult settings: **Enable Adult Content**, the Stash tab, the Whisparr servers, the StashDB and ThePornDB providers, the Adult Content permission, the scene and adult movie permissions and request limits, and sexual preferences.
- **Blur Adult Artwork** blurs scene stills and adult movie covers until the pointer is over them.
