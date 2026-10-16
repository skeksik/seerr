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
        orientations: data.orientations,
        // Like the cast, studios open their ThePornDB page
        studio: data.studio && {
          id: data.studio.id,
          name: data.studio.name,
          href: creditHref('adultmovie', 'studio', data.studio.id),
        },
        network: data.network && {
          name: data.network.name,
          href: creditHref('adultmovie', 'studio', data.network.id),
        },
        directors: data.directors,
        tags: data.tags,
        tagHref: (id) => `/discover/adultmovies?sort=released&tags=${id}`,
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
        tpdbUrl: data.tpdbUrl,
      }}
      manage={{ mediaType: 'adultmovie', data, revalidate: () => mutate() }}
      revalidate={() => mutate()}
    >
      {/* The StashDB scenes the movie is cut into */}
      <AdultTitleSlider
        mediaType="scene"
        sliderKey="adult-movie-scenes"
        title={intl.formatMessage(globalMessages.scenes)}
        url={`/api/v1/scene/movie/${data.id}`}
        hideWhenEmpty
      />
    </AdultTitleDetails>
  );
};

export default withAdultGate(AdultMovieDetails);
