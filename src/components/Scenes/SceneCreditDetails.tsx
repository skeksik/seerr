import AdultProfileLinks from '@app/components/AdultProfileLinks';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ImageFader from '@app/components/Common/ImageFader';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import CompanyCard from '@app/components/CompanyCard';
import SceneSlider from '@app/components/Scenes/SceneSlider';
import SeeAllStudiosCard from '@app/components/Scenes/SeeAllStudiosCard';
import Slider from '@app/components/Slider';
import XxxMovieSlider from '@app/components/XxxMovies/XxxMovieSlider';
import useAdult from '@app/hooks/useAdult';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { Transition } from '@headlessui/react';
import { ArrowRightCircleIcon, FilmIcon } from '@heroicons/react/24/outline';
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/solid';
import type {
  SceneListResponse,
  ScenePerformerDetails,
  SceneStudioDetails,
  WhisparrMonitorStatus,
} from '@server/models/Scene';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.SceneCreditDetails', {
  scenes: 'Scenes',
  sceneCount: '{count, plural, one {# scene} other {# scenes}} on StashDB',
  born: 'Born {date}',
  active: 'Active {start}–{end}',
  present: 'present',
  partOf: 'Part of {studio}',
  alsoknownas: 'Also Known As: {names}',
  openinwhisparr: 'Open in Whisparr',
  monitor: 'Monitor in Whisparr',
  monitored: 'Monitored in Whisparr',
  unmonitor: 'Stop Monitoring',
  monitorTitle: 'Monitor {name}',
  monitorPerformer:
    'Whisparr will add every scene with {name} and download new scenes as they are released.',
  monitorStudio:
    'Whisparr will add every scene from {name} and download new scenes as they are released.',
  searchExisting: 'Search for existing scenes now',
  searchExistingTip:
    'Starts a search for every scene that is not downloaded yet. This can queue a lot of downloads.',
  monitorSuccess: 'Whisparr is now monitoring <strong>{name}</strong>.',
  unmonitorSuccess: 'Whisparr stopped monitoring <strong>{name}</strong>.',
  monitorError: 'Something went wrong while updating Whisparr.',
  xxxMovies: 'XXX Movies',
  studios: 'Studios',
});

type CreditType = 'performer' | 'studio';
type CreditDetails = ScenePerformerDetails | SceneStudioDetails;

const isPerformer = (data: CreditDetails): data is ScenePerformerDetails =>
  'sceneCount' in data;

interface MonitorControlsProps {
  type: CreditType;
  id: string;
  name: string;
  status: WhisparrMonitorStatus;
  onChange: (status: WhisparrMonitorStatus) => void;
}

const MonitorControls = ({
  type,
  id,
  name,
  status,
  onChange,
}: MonitorControlsProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const update = async (monitored: boolean) => {
    setIsUpdating(true);

    try {
      const { data } = await axios.post<WhisparrMonitorStatus>(
        `/api/v1/scene/${type}/${id}/monitor`,
        { monitored, search: monitored && search }
      );
      onChange(data);
      setShowConfirm(false);
      addToast(
        intl.formatMessage(
          monitored ? messages.monitorSuccess : messages.unmonitorSuccess,
          { name, strong: (msg: React.ReactNode) => <strong>{msg}</strong> }
        ),
        { appearance: 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(messages.monitorError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Transition
        as="div"
        show={showConfirm}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Modal
          title={intl.formatMessage(messages.monitorTitle, { name })}
          onCancel={() => setShowConfirm(false)}
          onOk={() => update(true)}
          okText={intl.formatMessage(messages.monitor)}
          okButtonType="primary"
          okDisabled={isUpdating}
          backgroundClickable
        >
          <p className="text-gray-300">
            {intl.formatMessage(
              type === 'performer'
                ? messages.monitorPerformer
                : messages.monitorStudio,
              { name }
            )}
          </p>
          <div className="mt-4 flex items-start space-x-3">
            <input
              id="searchExisting"
              type="checkbox"
              className="mt-1"
              checked={search}
              onChange={() => setSearch((s) => !s)}
            />
            <label htmlFor="searchExisting">
              <span className="text-white">
                {intl.formatMessage(messages.searchExisting)}
              </span>
              <span className="block text-sm text-gray-400">
                {intl.formatMessage(messages.searchExistingTip)}
              </span>
            </label>
          </div>
        </Modal>
      </Transition>
      <a href={status.serviceUrl} target="_blank" rel="noreferrer">
        <Button buttonType="ghost">
          <ArrowTopRightOnSquareIcon />
          <span>{intl.formatMessage(messages.openinwhisparr)}</span>
        </Button>
      </a>
      {status.monitored ? (
        <Button
          buttonType="success"
          disabled={isUpdating}
          onClick={() => update(false)}
          className="group"
          title={intl.formatMessage(messages.unmonitor)}
        >
          <CheckIcon className="group-hover:hidden" />
          <EyeSlashIcon className="hidden group-hover:block" />
          <span className="group-hover:hidden">
            {intl.formatMessage(messages.monitored)}
          </span>
          <span className="hidden group-hover:inline">
            {intl.formatMessage(messages.unmonitor)}
          </span>
        </Button>
      ) : (
        <Button
          buttonType="primary"
          disabled={isUpdating}
          onClick={() => setShowConfirm(true)}
        >
          <EyeIcon />
          <span>{intl.formatMessage(messages.monitor)}</span>
        </Button>
      )}
    </>
  );
};

interface SceneCreditDetailsProps {
  type: CreditType;
}

const SceneCreditDetailsContent = ({ type }: SceneCreditDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const { data, error, mutate } = useSWR<CreditDetails>(
    id ? `/api/v1/scene/${type}/${id}` : null
  );
  // Movies come from ThePornDB, where performers and studios have own ids
  const { data: tpdbMatch } = useSWR<{ id: number; url?: string }>(
    id ? `/api/v1/xxxmovie/match/${type}/${id}` : null,
    { shouldRetryOnError: false }
  );
  // The slider's own request, so both share it
  const scenesUrl = `/api/v1/scene/discover?page=1&sort=date&${type}=${id}`;
  const { data: scenes } = useSWR<SceneListResponse>(id ? scenesUrl : null);

  // The person page's backdrop carousel, from the first scenes listed
  const backdropKey = (scenes?.results ?? [])
    .flatMap((scene) => stashImageUrl(scene.imageUrl, 1280) ?? [])
    .slice(0, 6)
    .join('|');
  const backdrops = useMemo(
    () => (backdropKey ? backdropKey.split('|') : []),
    [backdropKey]
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const attributes: string[] = [];
  let partOf: React.ReactNode = null;

  if (isPerformer(data)) {
    if (data.birthDate) {
      attributes.push(
        intl.formatMessage(messages.born, {
          date: intl.formatDate(data.birthDate, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          }),
        })
      );
    }
    if (data.country) {
      attributes.push(
        intl.formatDisplayName(data.country, { type: 'region' }) ?? data.country
      );
    }
    if (data.careerStart) {
      attributes.push(
        intl.formatMessage(messages.active, {
          start: data.careerStart,
          end: data.careerEnd ?? intl.formatMessage(messages.present),
        })
      );
    }
    attributes.push(
      intl.formatMessage(messages.sceneCount, { count: data.sceneCount })
    );
  } else if (data.parent) {
    partOf = intl.formatMessage(messages.partOf, {
      studio: (
        <Link
          key="parent"
          href={`/scenes/studio/${data.parent.id}`}
          className="font-semibold hover:underline"
        >
          {data.parent.name}
        </Link>
      ),
    });
  }

  const imageUrl = stashImageUrl(data.imageUrl, 600);

  return (
    <>
      <PageTitle title={data.name} />
      {backdrops.length > 0 && (
        <div className="absolute left-0 right-0 top-0 z-0 h-96">
          <ImageFader
            isDarker
            imageType="stashdb"
            backgroundImages={backdrops}
          />
        </div>
      )}
      <div className="relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row lg:items-start">
        {imageUrl && (
          <div
            className={`relative mb-6 mr-0 flex-shrink-0 overflow-hidden ring-1 ring-gray-700 lg:mb-0 lg:mr-6 ${
              type === 'performer'
                ? 'h-36 w-36 rounded-full lg:h-44 lg:w-44'
                : 'h-24 w-60 rounded-lg bg-gray-800 p-3'
            }`}
          >
            <CachedImage
              type="stashdb"
              src={imageUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: type === 'performer' ? 'cover' : 'contain',
                objectPosition: type === 'performer' ? 'top' : 'center',
              }}
              fill
            />
          </div>
        )}
        <div className="w-full text-center text-gray-300 lg:text-left">
          <h1 className="text-3xl text-white lg:text-4xl">{data.name}</h1>
          <div className="mt-2">
            <AdultProfileLinks
              links={[
                { url: data.stashDbUrl, site: 'StashDB' },
                // Performers ThePornDB links to this one, studios by name
                ...(tpdbMatch?.url
                  ? [{ url: tpdbMatch.url, site: 'ThePornDB' }]
                  : []),
                ...data.urls,
              ]}
            />
          </div>
          <div className="mb-2 mt-2 space-y-1 text-xs text-white sm:text-sm lg:text-base">
            {attributes.length > 0 && <div>{attributes.join(' | ')}</div>}
            {partOf && <div>{partOf}</div>}
            {data.aliases.length > 0 && (
              <div>
                {intl.formatMessage(messages.alsoknownas, {
                  names: data.aliases.reduce((prev, curr) =>
                    intl.formatMessage(globalMessages.delimitedlist, {
                      a: prev,
                      b: curr,
                    })
                  ),
                })}
              </div>
            )}
          </div>
          {(data.whisparr || tpdbMatch) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {tpdbMatch && (
                // Their ThePornDB page, with bio and movies
                <Link href={`/xxxmovies/${type}/${tpdbMatch.id}`}>
                  <Button buttonType="ghost">
                    <FilmIcon />
                    <span>{intl.formatMessage(messages.xxxMovies)}</span>
                  </Button>
                </Link>
              )}
              {data.whisparr && (
                <MonitorControls
                  type={type}
                  id={data.id}
                  name={data.name}
                  status={data.whisparr}
                  onChange={(whisparr) => mutate({ ...data, whisparr }, false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {!isPerformer(data) && data.studios.length > 0 && (
          <>
            <div className="slider-header">
              <Link
                href={`/scenes/studio/${data.id}/studios`}
                className="slider-title"
              >
                <span>{intl.formatMessage(messages.studios)}</span>
                <ArrowRightCircleIcon />
              </Link>
            </div>
            <Slider
              sliderKey={`network-studios-${data.id}`}
              isLoading={false}
              isEmpty={false}
              items={[
                ...data.studios.map((studio) => (
                  <CompanyCard
                    key={`network-studio-${studio.id}`}
                    name={studio.name}
                    image={stashImageUrl(studio.imageUrl, 300)}
                    imageType="stashdb"
                    url={`/scenes/studio/${studio.id}`}
                  />
                )),
                <SeeAllStudiosCard
                  key="network-studios-all"
                  url={`/scenes/studio/${data.id}/studios`}
                />,
              ]}
            />
          </>
        )}
        {/* Their titles open the tabs filtered to them, which sort */}
        <SceneSlider
          sliderKey={`scenes-${type}-${data.id}`}
          title={intl.formatMessage(messages.scenes)}
          url={scenesUrl}
          linkUrl={`/scenes?sort=date&${type}=${data.id}`}
        />
        {tpdbMatch && (
          <XxxMovieSlider
            sliderKey={`xxx-${type}-${tpdbMatch.id}`}
            title={intl.formatMessage(messages.xxxMovies)}
            url={`/api/v1/xxxmovie/discover?page=1&${type}=${tpdbMatch.id}`}
            linkUrl={`/xxxmovies?${type}=${tpdbMatch.id}`}
            hideWhenEmpty
          />
        )}
      </div>
    </>
  );
};

// Hooks above fetch unconditionally, so gate before mounting them
const SceneCreditDetails = ({ type }: SceneCreditDetailsProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <SceneCreditDetailsContent type={type} />;
};

export default SceneCreditDetails;
