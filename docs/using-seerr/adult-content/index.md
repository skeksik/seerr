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

Whisparr and Stash work like Radarr and Jellyfin do for movies, whether a title was requested through Seerr or added in Whisparr directly. A title Whisparr monitors shows as requested; once Whisparr has its file, or Stash has the scene, it is available and joins Recently Added. **Play on Stash** shows once Stash has the scene; until then, and always for adult movies, the **Available** badge opens the **Manage** panel for request managers. Available titles that neither Whisparr nor Stash still has are marked deleted by the availability sync.

## Enabling Adult Content

1. In **Settings &rarr; General**, turn on **Enable Adult Content**.
2. Give the **Adult Content** permission to each user who should see it (**Users &rarr; Edit &rarr; Permissions**), along with the request permissions they should have (see [Requesting Scenes and Adult Movies](#requesting-scenes-and-adult-movies)). Admins have access automatically.
3. Set up [StashDB](./stashdb) and [ThePornDB](./adult-movies), then [Whisparr](./whisparr), and optionally [Stash](./stash).

Users without the permission never see adult titles: scene pages show "not found", and adult movies, scenes and their requests are left out of search, discover, request lists and media lists.

## Browsing

Users with access get two sidebar tabs that work like **Movies** and **Series**: a grid with sorting and a **Filters** panel. Like them, they live under Discover, at `/discover/scenes` and `/discover/adultmovies`. **Scenes** sorts by popularity (the default), release date, date added to StashDB, duration and title, each either way, and by StashDB's trending order. Performer and studio pages (see [Performers and Studios](#performers-and-studios)) list their scenes and adult movies in a grid, newest first. Like movie rows, every adult row (on Discover and detail pages, and network studios) holds up to 20 cards, or 13 of the wider scene and studio cards, reading further pages when sexual preferences or the hide settings leave the first one short; the title always links the full list, and the **See More** card only shows when there is more than fits. Rows with nothing in them are left out.

- **Adult Movies** filters by release date, studio, performers and tags from ThePornDB.
- **Scenes** filters by release date, studios, performers and tags from StashDB.

The release date compares as equal, greater, greater or equal, less, or less or equal to the picked day; neither source takes a date range.

Both also leave out studios, performers and tags picked under **Exclude**. Filters always add up: a title needs all of the picked performers, all of the picked tags, and the studio. Studios are either-or: a title needs one of them, not all. ThePornDB filters by one studio at a time. Suggestions are whatever StashDB or ThePornDB finds for the typed text, whatever else is picked, so the same names show under a field and its **Exclude** twin. Filters that leave nothing, like a studio, performer or tag both picked and excluded, a tag standing for a hidden sexual preference, or excluding the tags of every picked sexual preference without straight (like the Lesbian tag with only lesbian picked), show no results; with **Unidentified** picked too, the unidentified titles still show.

**Sexual Preferences** shows straight, lesbian, bisexual or gay titles, and those with trans performers or futanari, like the filter adult sites offer. StashDB's orientation tags decide where a scene has them, adding straight where a woman and a man are both in it, so a lesbian-tagged scene with a man in it is straight and lesbian; otherwise its cast does: women and men are straight, two or more women lesbian, men alone gay, a lone woman both straight and lesbian, and any trans performer trans. StashDB's "Missing Performer" tags, group tags like "Threesome (BGG)", point of view tags like "Male - POV" (the performer behind the camera), tags naming who does what like "F on M", "Rimming - F On F" or "Male Fucks Male", tags naming someone's gender or role like "Asian Woman", "Stepmom" or "Maledom", body tags like "Big Tits" or "Big Dick", and act tags that need a man, like "Blowjob", "Handjob", "Deepthroat", "Cumshot", "Facial" or "Cum in Mouth", or a woman, like "Strap-on", "Scissoring" or "Squirting" ("Titjob" needs both) count toward the cast (body and act tags only when nothing points to a trans or futanari performer, who can have either; acts with toys, like "Dildo Blowjob", don't count), so a scene with only its male performer listed is not taken for a gay one, and a BGG threesome with only its women listed not for a lesbian one. Adult movies use ThePornDB's tags and cast the same way. Bisexual and futanari are known from tags only. Titles nothing is known about count as **Unidentified**, which has a pick of its own and shows next to any other pick. A title shows only when every sexual preference it suits is picked: unpicking one hides every title with it, alone or next to others, so without lesbian a straight and lesbian title is hidden too, even when a lesbian tag is picked. At least one sexual preference stays picked. StashDB is asked to leave out the orientation tags of unpicked preferences where no tag is picked. Without straight, the lists ask for titles tagged with a picked orientation, together with the picked tags where StashDB or ThePornDB allows it, as filtering the others out would leave pages nearly empty; unidentified titles are then read apart and joined in when picked. Where they can't, pages read 100 scenes or 60 movies at a time. Scene and adult movie cards show the sexual preferences a title suits as letters under the type badge (S, L, B, G, T, F), named on hover; their pages spell them out under the title, boxed like a movie's certification.

Each user picks which sexual preferences are on by default in their **General** settings. Admins see these and the other adult settings of every user, whatever the user's permissions, as long as adult content is on and their own safe mode is off. Admins can take some away from a user under **Allowed Sexual Preferences**, the same way they set request limits; those never show for that user, not even in search or recommendations.

Search shows matching scenes in a row above the regular results. Adult movies and performers join the regular results: StashDB's first, then ThePornDB's. A ThePornDB performer linked to a StashDB one is left out when that StashDB performer is already among the results, and otherwise opens the StashDB page, with ThePornDB's picture. The others are marked ThePornDB and open their ThePornDB page.

Scene and adult movie cards work like movie cards: hover one for its details and the **Request**, watchlist and blocklist buttons. Scenes and adult movies can be added to the watchlist and the blocklist from their cards and pages, and show up on the Watchlist and Blocklist pages for users with the **Adult Content** permission.

The **Hide Available Media**, **Hide Requested Media** and **Hide Blocklisted Items** settings (**Settings &rarr; General**) apply to scenes and adult movies like they do to movies: in the Scenes and Adult Movies tabs, the adult Discover rows, performer and studio pages, and recommendations and similar titles. Like movies, they still show in search results, and an adult movie's page shows all of its scenes, like a collection does its movies. Users without the **Manage Blocklist** or **View Blocklist** permission never see blocklisted titles.

### Discover Rows

The Discover page gets adult rows at the bottom: trending, popular, new and upcoming scenes; new and upcoming adult movies; and **Studios** and **Networks**, the studios behind the scenes trending on StashDB. Their titles and **See More** cards open every StashDB studio or network, searchable by name; the Studios list leaves out networks. Listed by name or searched, the Studios list also takes in ThePornDB's sites that no StashDB studio has the name of or links to, leaving out clip store channels like "Manyvids: Someone"; they open their ThePornDB page. ThePornDB can't tell networks apart or sort its sites by date, so the Networks list and the other orders stay StashDB's. These lists start out like the rows, by trending, and also sort by popularity, date added to StashDB or title, each either way; ThePornDB's sites only join the title order from A to Z. StashDB can't rank studios itself, so trending and popularity count each studio's scenes among the top 5,000 trending or popular ones; studios without any there are only listed by name or newest. A network's page links to all its studios the same way. Recently Added gets a row of its own for scenes, and Recent Requests includes scene and adult movie requests. Admins can reorder or hide them in the Discover editor like any other row. Users without adult access never see them.

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
- the ThePornDB performer lists the StashDB profile among its links. ThePornDB keeps no StashDB links for sites, so studios are linked from StashDB only. When several StashDB studios link one site, like Blacked and Adult Time x Blacked, the site belongs to the one named like it, and its movies show on that page only.

Names alone never link them. Linked performers and studios have a single page, StashDB's: its details, its links (with the ThePornDB profile), its scenes, and the ThePornDB adult movies in a row. Every link to the ThePornDB performer or studio, from adult movie casts and studios, the **More from** banner, search results, network site lists and the Studios list, opens that StashDB page instead, and the ThePornDB address forwards to it. Performers and studios neither side links keep a page on each: StashDB's with its scenes, ThePornDB's with its own details, bio and adult movies.

For example, Gal Ritchie's ThePornDB profile links her StashDB profile, so she has one page, with StashDB's details, her StashDB scenes and her ThePornDB movies. Little Dragon has a profile on both, but neither links the other, so each keeps its own page. Some adult movies credit performers ThePornDB has no profile for; they show in the cast without a link.

A performer or studio page has a selector at the top right, like a person page's: **All**, **Adult Movies** and **Scenes**. Under **All**, those with both get a row of each, adult movies first; those with one kind get a grid of it, newest first. **Adult Movies** and **Scenes** show the grid of that kind, headed by its name, which opens the browse tab filtered to them. All three are always offered; a kind they have none of leaves the page empty. Adult movies come from the linked ThePornDB performer or studio; a StashDB network that links no ThePornDB site of its own gets the ThePornDB network its studios' sites belong to (Vixen Media Group, for example, through Blacked, Tushy and the rest). A network's studios (or sites) show above the titles whatever the selection.

Links on performer and studio pages show as StashDB's icon for the site, or a logo where StashDB has no icon, or by name for sites without either. A network's page also lists its studios (or a ThePornDB network its sites) and the titles of all of them. Request managers can monitor StashDB performers and studios in Whisparr from their page; see [Whisparr](/using-seerr/adult-content/whisparr#monitoring-performers-and-studios).

ThePornDB can't be asked which performer links a StashDB id, so the StashDB page looks for it among the ThePornDB performers of the same name or first alias, and keeps any ThePornDB performer seen linking to it. Matches are kept for six hours, like other details.

## Scenes

Scenes are their own media type, separate from movies and series.

Each scene page shows the StashDB details, the cast (with a **Full Cast** page) and tags; a tag opens the Scenes tab filtered to it, in the tab's default order, as do the tags of adult movie pages in the Adult Movies tab.

### Detail Pages

Scene and adult movie pages are laid out like movie pages:

- A **More from** banner for the studio, like the collection banner on movies, opens the studio's titles.
- **Recommendations** lists other titles with any of the same performers. For scenes these are the most popular on StashDB, read like the Scenes tab, so with straight hidden StashDB is asked for the tagged ones; for adult movies, the newest released on ThePornDB.
- **Similar** looks at content rather than people. For scenes, Seerr takes the 100 most popular StashDB scenes sharing at least one tag (and, with straight hidden, the 100 most popular tagged with a shown orientation), leaves out hidden sexual preferences and ranks the rest by how many tags they share (top 40). For adult movies it uses ThePornDB's own similar list, about 9 movies.
- The links at the bottom of the facts table open the title on Stash, StashDB, ThePornDB or the studio's site. Sites StashDB has an icon for show it alone, named on hover.
- Directors show under the overview, with a **View Full Crew** link to the **Full Crew** page (`/scene/<id>/crew` or `/adultmovie/<id>/crew`). Neither StashDB nor ThePornDB has crew profiles, so crew cards, like cast members without a profile, link nowhere.
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

Like for movies and series, Auto-Request only works through the [Plex Watchlist](../plex/watchlist-auto-request). Scenes and adult movies can't be on the Plex Watchlist, so **Auto-Request Scenes** and **Auto-Request Adult Movies** have no effect on them: adding a scene or adult movie to Seerr's watchlist only adds it to the watchlist and never requests it. Request it from its page instead.

### Quotas

Scenes and adult movies each have their own request limit, next to the movie and series limits; adult movie requests don't count against the movie limit. Set the defaults under **Settings &rarr; Users &rarr; Global Scene Request Limit** and **Global Adult Movie Request Limit**, or override them for a user in their **General** settings. Like the others, 4K requests count too, and request managers can bypass the limits per request. Users see what is left on their profile and in the request window.

## Adult Movies

Adult movies come from ThePornDB. See [Adult Movies](./adult-movies). Requests for them go to Whisparr and count against the adult movie quota.

Only ThePornDB movies and StashDB scenes are adult content in Seerr. Movies TMDB flags as adult are ordinary movies: they are shown, requested through Radarr, scanned and counted like any other movie, exactly as without adult content.

## Safe Mode and Blurred Artwork

Users with adult access get two switches in their user menu:

- **Safe Mode** hides all adult content at once, for example while sharing a screen. Seerr treats the user as having no adult access until it is turned off again, leaving scene and adult movie requests out of request lists and profiles too; the permission itself is kept. For admins it also hides the adult settings: **Enable Adult Content**, the Stash tab, the Whisparr servers, the StashDB and ThePornDB providers, the Adult Content permission, the scene and adult movie permissions and request limits, and sexual preferences.
- **Blur Adult Artwork** blurs scene stills and adult movie covers until the pointer is over them.
