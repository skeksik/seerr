import withAdultGate from '@app/components/Common/AdultGate';
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
import type {
  AdultPerformerDetails,
  AdultStudioDetails,
} from '@server/models/AdultCredit';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';
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

// Pages for ThePornDB performers and studios neither StashDB nor ThePornDB
// link to a StashDB one; linked ones have the StashDB page only
const AdultCreditDetails = ({ type }: AdultCreditDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const { data, error } = useSWR<CreditDetails>(
    id ? `/api/v1/adultmovie/${type}/${id}` : null
  );
  const stashDbId = data?.stashDbId;
  // The slider's own request, so both share it; a linked page's StashDB page
  // shows the same list
  const moviesUrl = creditTitlesUrl('adultmovie', type, id);
  const { data: movies } = useSWR<AdultMovieListResponse>(
    id ? moviesUrl : null
  );

  useEffect(() => {
    if (stashDbId) {
      router.replace(creditHref(type, stashDbId));
    }
  }, [router, type, stashDbId]);

  // Backdrops from the first movies listed, like the StashDB pages
  const backdrops = useMemo(
    () =>
      (movies?.results ?? [])
        .flatMap((movie) => movie.backdropUrl ?? [])
        .slice(0, 6),
    [movies]
  );

  if ((!data && !error) || stashDbId) {
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
                href: creditHref(
                  'studio',
                  data.network.stashDbId ?? data.network.id
                ),
              }
            : undefined
        }
        aliases={isPerformer(data) ? data.aliases : []}
        bio={isPerformer(data) ? data.bio : undefined}
      />
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {!isPerformer(data) && data.sites.length > 0 && (
          <AdultStudioRow
            sliderKey={`tpdb-sites-${data.id}`}
            title={intl.formatMessage(messages.sites)}
            linkUrl={`${creditHref('studio', data.id)}/studios`}
            mediaType="adultmovie"
            studios={data.sites}
          />
        )}
        {/* Their titles open the tab filtered to them, which sorts */}
        <AdultTitleSlider
          mediaType="adultmovie"
          sliderKey={`adult-${type}-${data.id}`}
          title={intl.formatMessage(globalMessages.adultMovies)}
          url={moviesUrl}
          linkUrl={creditBrowseHref('adultmovie', type, data.id)}
        />
      </div>
    </>
  );
};

export default withAdultGate(AdultCreditDetails);
