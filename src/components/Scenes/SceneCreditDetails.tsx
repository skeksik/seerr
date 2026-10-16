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
import MonitorControls from '@app/components/Scenes/MonitorControls';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type {
  SceneListResponse,
  ScenePerformerDetails,
  SceneStudioDetails,
} from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.SceneCreditDetails', {
  sceneCount: '{count, plural, one {# scene} other {# scenes}} on StashDB',
  studios: 'Studios',
});

type CreditType = 'performer' | 'studio';
type CreditDetails = ScenePerformerDetails | SceneStudioDetails;

const isPerformer = (data: CreditDetails): data is ScenePerformerDetails =>
  'sceneCount' in data;

interface SceneCreditDetailsProps {
  type: CreditType;
}

const isTpdbLink = (url: string): boolean =>
  /^https?:\/\/(www\.)?theporndb\.net\//i.test(url);

// Pages for StashDB performers and studios. Linked to a ThePornDB one, by a
// link on either side, they are its page too and add its movies
const SceneCreditDetails = ({ type }: SceneCreditDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const { data, error, mutate } = useSWR<CreditDetails>(
    id ? `/api/v1/scene/${type}/${id}` : null
  );
  // Movies come from ThePornDB, where performers and studios have own ids
  const { data: tpdbMatch } = useSWR<{ id: number; url?: string }>(
    id ? `/api/v1/adultmovie/match/${type}/${id}` : null,
    { shouldRetryOnError: false }
  );
  // The slider's own request, so both share it
  const scenesUrl = creditTitlesUrl('scene', type, id);
  const { data: scenes } = useSWR<SceneListResponse>(id ? scenesUrl : null);

  // The person page's backdrop carousel, from the first scenes listed
  const backdrops = useMemo(
    () =>
      (scenes?.results ?? [])
        .flatMap((scene) => stashImageUrl(scene.imageUrl, 1280) ?? [])
        .slice(0, 6),
    [scenes]
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <AdultCreditHeader
        type={type}
        name={data.name}
        imageType="stashdb"
        imageUrl={stashImageUrl(data.imageUrl, 600)}
        backdrops={backdrops}
        links={[
          { url: data.stashDbUrl, site: 'StashDB' },
          // The linked ThePornDB profile, unless StashDB lists it already
          ...(tpdbMatch?.url && !data.urls.some(({ url }) => isTpdbLink(url))
            ? [{ url: tpdbMatch.url, site: 'ThePornDB' }]
            : []),
          ...data.urls,
        ]}
        attributes={
          isPerformer(data)
            ? [
                ...personAttributes(intl, {
                  birthDate: data.birthDate,
                  place: data.country
                    ? (intl.formatDisplayName(data.country, {
                        type: 'region',
                      }) ?? data.country)
                    : undefined,
                  careerStart: data.careerStart,
                  careerEnd: data.careerEnd,
                }),
                intl.formatMessage(messages.sceneCount, {
                  count: data.sceneCount,
                }),
              ]
            : []
        }
        partOf={
          !isPerformer(data) && data.parent
            ? {
                name: data.parent.name,
                href: creditHref('studio', data.parent.id),
              }
            : undefined
        }
        aliases={data.aliases}
        actions={
          data.whisparr && (
            <MonitorControls
              type={type}
              id={data.id}
              name={data.name}
              status={data.whisparr}
              onChange={(whisparr) => mutate({ ...data, whisparr }, false)}
            />
          )
        }
      />
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {!isPerformer(data) && data.studios.length > 0 && (
          <AdultStudioRow
            sliderKey={`network-studios-${data.id}`}
            title={intl.formatMessage(messages.studios)}
            linkUrl={`${creditHref('studio', data.id)}/studios`}
            mediaType="scene"
            studios={data.studios}
          />
        )}
        {/* Their titles open the tabs filtered to them, which sort */}
        <AdultTitleSlider
          mediaType="scene"
          sliderKey={`scenes-${type}-${data.id}`}
          title={intl.formatMessage(globalMessages.scenes)}
          url={scenesUrl}
          linkUrl={creditBrowseHref('scene', type, data.id)}
        />
        {tpdbMatch && (
          <AdultTitleSlider
            mediaType="adultmovie"
            sliderKey={`adult-${type}-${tpdbMatch.id}`}
            title={intl.formatMessage(globalMessages.adultMovies)}
            url={creditTitlesUrl('adultmovie', type, tpdbMatch.id)}
            linkUrl={creditBrowseHref('adultmovie', type, tpdbMatch.id)}
          />
        )}
      </div>
    </>
  );
};

export default withAdultGate(SceneCreditDetails);
