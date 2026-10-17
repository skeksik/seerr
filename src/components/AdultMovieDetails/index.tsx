import AdultTitleDetails, {
  refreshWhileDownloading,
} from '@app/components/AdultTitleDetails';
import withAdultGate from '@app/components/Common/AdultGate';
import {
  creditHref,
  toSliderPerformer,
} from '@app/components/Common/adultRoutes';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import { linkLabel } from '@app/utils/linkLabel';
import type { AdultMovieDetails as AdultMovieDetailsType } from '@server/models/AdultMovie';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const AdultMovieDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const { data, error, mutate } = useSWR<AdultMovieDetailsType>(
    router.query.adultMovieId
      ? `/api/v1/adultmovie/${router.query.adultMovieId}`
      : null,
    { refreshInterval: refreshWhileDownloading() }
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const backdrop = data.backdropUrl ?? data.posterUrl;

  return (
    <AdultTitleDetails
      title={{
        mediaType: 'adultmovie',
        id: data.id,
        title: data.title,
        overview: data.overview,
        releaseDate: data.releaseDate,
        duration: data.duration,
        // Like the cast, studios open their StashDB page when linked to
        // one, and are plain text otherwise. The banner lists the site's
        // movies by its ThePornDB id, or the network's, which ThePornDB
        // lists with its sites' movies, when only the network is linked
        studio: data.studio && {
          id: data.studio.id,
          name: data.studio.name,
          href: data.studio.stashDbId
            ? creditHref('studio', data.studio.stashDbId)
            : null,
        },
        network: data.network && {
          id: data.network.id,
          name: data.network.name,
          href: data.network.stashDbId
            ? creditHref('studio', data.network.stashDbId)
            : null,
        },
        directors: data.directors,
        tags: data.tags,
        // ThePornDB cannot look tags up by id, so the filter takes the name along
        tagHref: ({ id, name }) =>
          `/discover/adultmovies?tags=${id}&tagNames=${encodeURIComponent(name)}`,
        links: data.url ? [{ url: data.url, site: linkLabel(data.url) }] : [],
        imageType: 'tpdb',
        backdrop: backdrop
          ? { src: backdrop, blur: !data.backdropUrl }
          : undefined,
        poster: { src: data.posterUrl, landscape: false },
        performers: data.performers.map((performer) =>
          toSliderPerformer('adultmovie', performer)
        ),
        mediaInfo: data.mediaInfo,
        onUserWatchlist: data.onUserWatchlist,
        trailerUrl: data.trailerUrl,
        tpdbUrl: data.tpdbUrl,
      }}
      manage={{ mediaType: 'adultmovie', data, revalidate: () => mutate() }}
      revalidate={() => mutate()}
    >
      {/* The StashDB scenes the movie is cut into, all shown like the
          parts of a collection */}
      <AdultTitleSlider
        mediaType="scene"
        sliderKey="adult-movie-scenes"
        title={intl.formatMessage(globalMessages.scenes)}
        url={`/api/v1/scene/movie/${data.id}`}
        applyHideSettings={false}
      />
    </AdultTitleDetails>
  );
};

export default withAdultGate(AdultMovieDetails);
