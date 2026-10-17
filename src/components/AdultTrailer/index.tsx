import withAdultGate from '@app/components/Common/AdultGate';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultTrailer', {
  trailer: 'Trailer',
});

// An adult movie's trailer, played here: studios' CDNs often send their
// videos as downloads, which a video element plays all the same
const AdultTrailer = () => {
  const router = useRouter();
  const intl = useIntl();
  const id = router.query.adultMovieId;
  const { data, error } = useSWR<AdultMovieDetails>(
    id ? `/api/v1/adultmovie/${id}` : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data?.trailerUrl) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <PageTitle title={[intl.formatMessage(messages.trailer), data.title]} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            <Link href={`/adultmovie/${data.id}`} className="hover:underline">
              {data.title}
            </Link>
          }
        >
          {intl.formatMessage(messages.trailer)}
        </Header>
      </div>
      {/* ThePornDB lists no captions for trailers */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={data.trailerUrl}
        controls
        autoPlay
        playsInline
        className="max-h-[75vh] w-full rounded-xl bg-black shadow-lg"
      />
    </>
  );
};

export default withAdultGate(AdultTrailer);
