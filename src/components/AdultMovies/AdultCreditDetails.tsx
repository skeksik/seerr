import withAdultGate from '@app/components/Common/AdultGate';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import {
  creditBrowseHref,
  creditHref,
  creditTitlesUrl,
} from '@app/components/Common/adultRoutes';
import AdultCreditHeader, {
  personAttributes,
} from '@app/components/Scenes/AdultCreditHeader';
import AdultStudioRow from '@app/components/Scenes/AdultStudioRow';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { FilmIcon } from '@heroicons/react/24/solid';
import type {
  AdultPerformerDetails,
  AdultStudioDetails,
} from '@server/models/AdultCredit';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultMovies.AdultCreditDetails', {
  sites: 'Sites',
});

type CreditType = 'performer' | 'studio';
type CreditDetails = AdultPerformerDetails | AdultStudioDetails;

const isPerformer = (data: CreditDetails): data is AdultPerformerDetails =>
  'aliases' in data;

interface AdultCreditDetailsProps {
  type: CreditType;
}

// Pages for ThePornDB performers and studios, for those without a StashDB
// page and for the movies of those that have one
const AdultCreditDetails = ({ type }: AdultCreditDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const { data, error } = useSWR<CreditDetails>(
    id ? `/api/v1/adultmovie/${type}/${id}` : null
  );
  // The slider's own request, so both share it
  const moviesUrl = creditTitlesUrl('adultmovie', type, id);
  const { data: movies } = useSWR<AdultMovieListResponse>(
    id ? moviesUrl : null
  );

  // Backdrops from the first movies listed, like the StashDB pages
  const backdrops = useMemo(
    () =>
      (movies?.results ?? [])
        .flatMap((movie) => movie.backdropUrl ?? [])
        .slice(0, 6),
    [movies]
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const links = isPerformer(data)
    ? data.links
    : data.url
      ? [{ url: data.url, site: 'Home' }]
      : [];

  return (
    <>
      <AdultCreditHeader
        type={type}
        name={data.name}
        imageType="tpdb"
        imageUrl={data.imageUrl}
        backdrops={backdrops}
        links={[{ url: data.tpdbUrl, site: 'ThePornDB' }, ...links]}
        attributes={
          isPerformer(data)
            ? personAttributes(intl, {
                birthDate: data.birthDate,
                place: data.birthplace,
                careerStart: data.careerStart,
                careerEnd: data.careerEnd,
              })
            : []
        }
        partOf={
          !isPerformer(data) && data.network
            ? {
                name: data.network.name,
                href: creditHref('adultmovie', 'studio', data.network.id),
              }
            : undefined
        }
        aliases={isPerformer(data) ? data.aliases : []}
        bio={isPerformer(data) ? data.bio : undefined}
        actions={
          data.stashDbId && (
            // Their scenes live on the StashDB page
            <Link href={creditHref('scene', type, data.stashDbId)}>
              <Button buttonType="ghost">
                <FilmIcon />
                <span>{intl.formatMessage(globalMessages.scenes)}</span>
              </Button>
            </Link>
          )
        }
      />
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {!isPerformer(data) && data.sites.length > 0 && (
          <AdultStudioRow
            sliderKey={`tpdb-sites-${data.id}`}
            title={intl.formatMessage(messages.sites)}
            linkUrl={`/discover/adultmovies/studio/${data.id}/sites`}
            mediaType="adultmovie"
            studios={data.sites}
          />
        )}
        {/* Their titles open the tabs filtered to them, which sort */}
        <AdultTitleSlider
          mediaType="adultmovie"
          sliderKey={`adult-${type}-${data.id}`}
          title={intl.formatMessage(globalMessages.adultMovies)}
          url={moviesUrl}
          linkUrl={creditBrowseHref('adultmovie', type, data.id)}
          hideWhenEmpty
        />
        {data.stashDbId && (
          <AdultTitleSlider
            mediaType="scene"
            sliderKey={`scenes-${type}-${data.stashDbId}`}
            title={intl.formatMessage(globalMessages.scenes)}
            url={creditTitlesUrl('scene', type, data.stashDbId)}
            linkUrl={creditBrowseHref('scene', type, data.stashDbId)}
            hideWhenEmpty
          />
        )}
      </div>
    </>
  );
};

export default withAdultGate(AdultCreditDetails);
