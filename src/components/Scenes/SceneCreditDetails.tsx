import withAdultGate from '@app/components/Common/AdultGate';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import {
  creditHref,
  creditTitlesUrl,
} from '@app/components/Common/adultRoutes';
import AdultCreditHeader, {
  personAttributes,
} from '@app/components/Scenes/AdultCreditHeader';
import {
  CreditTitles,
  CreditTitlesPlaceholder,
  CreditViewPicker,
  useCreditView,
} from '@app/components/Scenes/AdultCreditView';
import AdultStudioRow from '@app/components/Scenes/AdultStudioRow';
import MonitorControls from '@app/components/Scenes/MonitorControls';
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
  scenesOnlyPerformer:
    "Whisparr can monitor this performer's scenes only: their <stashdb>StashDB</stashdb> profile does not link ThePornDB. Add the link on <stashdb>StashDB</stashdb> to monitor their movies too.",
  scenesOnlyStudio:
    "Whisparr can monitor this studio's scenes only: its <stashdb>StashDB</stashdb> profile does not link ThePornDB. Add the link on <stashdb>StashDB</stashdb> to monitor its movies too.",
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
  // Movies come from ThePornDB, where performers and studios have own ids.
  // Whisparr finds them through the StashDB profile's link alone
  const { data: tpdbMatch, error: matchError } = useSWR<{
    id: number;
    url?: string;
    via: 'stashdb' | 'tpdb' | 'network';
  }>(id ? `/api/v1/adultmovie/match/${type}/${id}` : null, {
    shouldRetryOnError: false,
  });
  // The slider's own request, so both share it
  const scenesUrl = creditTitlesUrl('scene', type, id);
  const { data: scenes } = useSWR<SceneListResponse>(id ? scenesUrl : null);
  const [view, setView] = useCreditView();

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

  const hasStudios = !isPerformer(data) && data.studios.length > 0;
  // Linked another way, Whisparr monitors their scenes only, unless it
  // says otherwise once it follows them
  const scenesOnly =
    !!data.whisparr &&
    data.whisparr.moviesAvailable !== true &&
    !!tpdbMatch &&
    tpdbMatch.via !== 'stashdb';

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
        picker={<CreditViewPicker view={view} onChange={setView} />}
        actions={
          data.whisparr && (
            <MonitorControls
              type={type}
              id={data.id}
              name={data.name}
              status={data.whisparr}
              moviesLinked={tpdbMatch && tpdbMatch.via === 'stashdb'}
              onChange={(whisparr) => mutate({ ...data, whisparr }, false)}
            />
          )
        }
      />
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {/* A network's studios show whatever the view */}
        {hasStudios && (
          <AdultStudioRow
            sliderKey={`network-studios-${data.id}`}
            title={intl.formatMessage(messages.studios)}
            linkUrl={`${creditHref('studio', data.id)}/studios`}
            studios={data.studios}
          />
        )}
        {/* Movies wait for the ThePornDB match, if there is one */}
        {tpdbMatch || matchError ? (
          <>
            {scenesOnly && (
              <p className="mb-4 text-sm text-gray-400">
                {intl.formatMessage(
                  type === 'performer'
                    ? messages.scenesOnlyPerformer
                    : messages.scenesOnlyStudio,
                  {
                    stashdb: (msg: React.ReactNode) => (
                      <a
                        href={data.stashDbUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-300 hover:underline"
                      >
                        {msg}
                      </a>
                    ),
                  }
                )}
              </p>
            )}
            <CreditTitles
              view={view}
              movies={
                tpdbMatch && { type, id: tpdbMatch.id, browseId: data.id }
              }
              scenes={{ type, id: data.id }}
            />
          </>
        ) : (
          <CreditTitlesPlaceholder />
        )}
      </div>
    </>
  );
};

export default withAdultGate(SceneCreditDetails);
