import AdultMovieSlider from '@app/components/AdultMovies/AdultMovieSlider';
import AdultProfileLinks from '@app/components/AdultProfileLinks';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ImageFader from '@app/components/Common/ImageFader';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import CompanyCard from '@app/components/CompanyCard';
import SceneSlider from '@app/components/Scenes/SceneSlider';
import SeeAllStudiosCard from '@app/components/Scenes/SeeAllStudiosCard';
import Slider from '@app/components/Slider';
import useAdult from '@app/hooks/useAdult';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import { FilmIcon } from '@heroicons/react/24/solid';
import type {
  AdultPerformerDetails,
  AdultStudioDetails,
} from '@server/models/AdultCredit';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultMovies.AdultCreditDetails', {
  born: 'Born {date}',
  active: 'Active {start}–{end}',
  present: 'present',
  partOf: 'Part of {studio}',
  alsoknownas: 'Also Known As: {names}',
  sites: 'Sites',
  scenes: 'Scenes',
  showmore: 'Show More',
  showless: 'Show Less',
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
const AdultCreditDetailsContent = ({ type }: AdultCreditDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const [showFullBio, setShowFullBio] = useState(false);
  const { data, error } = useSWR<CreditDetails>(
    id ? `/api/v1/adultmovie/${type}/${id}` : null
  );
  // The slider's own request, so both share it
  const moviesUrl = `/api/v1/adultmovie/discover?page=1&sort=released&${type}=${id}`;
  const { data: movies } = useSWR<AdultMovieListResponse>(
    id ? moviesUrl : null
  );

  // Backdrops from the first movies listed, like the StashDB pages
  const backdropKey = (movies?.results ?? [])
    .flatMap((movie) => movie.backdropUrl ?? [])
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
  let bio: string | undefined;

  if (isPerformer(data)) {
    bio = data.bio;
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
    if (data.birthplace) {
      attributes.push(data.birthplace);
    }
    if (data.careerStart) {
      attributes.push(
        intl.formatMessage(messages.active, {
          start: data.careerStart,
          end: data.careerEnd ?? intl.formatMessage(messages.present),
        })
      );
    }
  } else if (data.network) {
    partOf = intl.formatMessage(messages.partOf, {
      studio: (
        <Link
          key="network"
          href={`/discover/adultmovies/studio/${data.network.id}`}
          className="font-semibold hover:underline"
        >
          {data.network.name}
        </Link>
      ),
    });
  }

  const links = isPerformer(data)
    ? data.links
    : data.url
      ? [{ url: data.url, site: 'Home' }]
      : [];
  const aliases = isPerformer(data) ? data.aliases : [];

  return (
    <>
      <PageTitle title={data.name} />
      {backdrops.length > 0 && (
        <div className="absolute left-0 right-0 top-0 z-0 h-96">
          <ImageFader isDarker imageType="tpdb" backgroundImages={backdrops} />
        </div>
      )}
      <div className="relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row lg:items-start">
        {data.imageUrl && (
          <div
            className={`relative mb-6 mr-0 flex-shrink-0 overflow-hidden ring-1 ring-gray-700 lg:mb-0 lg:mr-6 ${
              type === 'performer'
                ? 'h-36 w-36 rounded-full lg:h-44 lg:w-44'
                : 'h-24 w-60 rounded-lg bg-gray-800 p-3'
            }`}
          >
            <CachedImage
              type="tpdb"
              src={data.imageUrl}
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
              links={[{ url: data.tpdbUrl, site: 'ThePornDB' }, ...links]}
            />
          </div>
          <div className="mb-2 mt-2 space-y-1 text-xs text-white sm:text-sm lg:text-base">
            {attributes.length > 0 && <div>{attributes.join(' | ')}</div>}
            {partOf && <div>{partOf}</div>}
            {aliases.length > 0 && (
              <div>
                {intl.formatMessage(messages.alsoknownas, {
                  names: aliases.reduce((prev, curr) =>
                    intl.formatMessage(globalMessages.delimitedlist, {
                      a: prev,
                      b: curr,
                    })
                  ),
                })}
              </div>
            )}
          </div>
          {bio && (
            <div className="relative mt-4 text-left text-sm text-gray-300">
              <p
                className={`whitespace-pre-line ${
                  showFullBio ? '' : 'line-clamp-4'
                }`}
              >
                {bio}
              </p>
              {(bio.length > 400 || bio.split('\n').length > 4) && (
                <button
                  type="button"
                  className="mt-1 text-gray-400 transition duration-300 hover:text-white hover:underline"
                  onClick={() => setShowFullBio(!showFullBio)}
                >
                  {intl.formatMessage(
                    showFullBio ? messages.showless : messages.showmore
                  )}
                </button>
              )}
            </div>
          )}
          {data.stashDbId && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {/* Their scenes live on the StashDB page */}
              <Link href={`/discover/scenes/${type}/${data.stashDbId}`}>
                <Button buttonType="ghost">
                  <FilmIcon />
                  <span>{intl.formatMessage(messages.scenes)}</span>
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
      {/* Above the backdrop carousel, which spans the top of the page */}
      <div className="relative z-10">
        {!isPerformer(data) && data.sites.length > 0 && (
          <>
            <div className="slider-header">
              <Link
                href={`/discover/adultmovies/studio/${data.id}/sites`}
                className="slider-title"
              >
                <span>{intl.formatMessage(messages.sites)}</span>
                <ArrowRightCircleIcon />
              </Link>
            </div>
            <Slider
              sliderKey={`tpdb-sites-${data.id}`}
              isLoading={false}
              isEmpty={false}
              items={[
                ...data.sites.map((site) => (
                  <CompanyCard
                    key={`tpdb-site-${site.id}`}
                    name={site.name}
                    image={site.imageUrl}
                    imageType="tpdb"
                    url={`/discover/adultmovies/studio/${site.id}`}
                  />
                )),
                <SeeAllStudiosCard
                  key="tpdb-sites-all"
                  url={`/discover/adultmovies/studio/${data.id}/sites`}
                />,
              ]}
            />
          </>
        )}
        {/* Their titles open the tabs filtered to them, which sort */}
        <AdultMovieSlider
          sliderKey={`adult-${type}-${data.id}`}
          title={intl.formatMessage(globalMessages.adultMovies)}
          url={moviesUrl}
          linkUrl={`/discover/adultmovies?${type}=${data.id}`}
          hideWhenEmpty
        />
        {data.stashDbId && (
          <SceneSlider
            sliderKey={`scenes-${type}-${data.stashDbId}`}
            title={intl.formatMessage(messages.scenes)}
            url={`/api/v1/scene/discover?page=1&sort=date&${type}=${data.stashDbId}`}
            linkUrl={`/discover/scenes?sort=date&${type}=${data.stashDbId}`}
            hideWhenEmpty
          />
        )}
      </div>
    </>
  );
};

// Hooks above fetch unconditionally, so gate before mounting them
const AdultCreditDetails = ({ type }: AdultCreditDetailsProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <AdultCreditDetailsContent type={type} />;
};

export default AdultCreditDetails;
