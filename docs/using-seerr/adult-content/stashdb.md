---
title: StashDB
description: Use StashDB as the metadata provider for scenes.
sidebar_position: 2
---

# StashDB

[StashDB](https://stashdb.org) is a community database of adult scenes, performers and studios. Seerr uses it for all scene metadata. Any other stash-box instance works the same way.

## Setup

Go to **Settings &rarr; Metadata Providers**. The **Adult Content** section shows while adult content is enabled.

#### StashDB GraphQL Endpoint

The stash-box GraphQL endpoint. For StashDB this is `https://stashdb.org/graphql`.

#### StashDB API Key

StashDB requires an account. Create an API key on your StashDB profile page and paste it here.

**Test** checks every provider on the page, and **Save Changes** saves them all.

## Notes

- Seerr caches StashDB responses (details for 6 hours, lists for 1 hour) and limits itself to 4 requests per second, the same budget Stash uses.
- When **Cache Images** is turned on in **Settings &rarr; General**, StashDB images are cached through Seerr's image proxy like TMDB images.
- Scenes are matched across Seerr, Whisparr and Stash by their StashDB id, so Whisparr and Stash should use the same stash-box instance.
