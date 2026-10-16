import AdultCreditDetails from '@app/components/AdultMovies/AdultCreditDetails';
import { isTpdbCreditId } from '@app/components/Common/adultRoutes';
import SceneCreditDetails from '@app/components/Scenes/SceneCreditDetails';
import { useRouter } from 'next/router';

interface AdultCreditPageProps {
  type: 'performer' | 'studio';
}

// /performer/[id] and /studio/[id]: StashDB's page for its UUIDs, ThePornDB's
// for its numeric ids
const AdultCreditPage = ({ type }: AdultCreditPageProps) => {
  const router = useRouter();

  return isTpdbCreditId(router.query.id as string | undefined) ? (
    <AdultCreditDetails type={type} />
  ) : (
    <SceneCreditDetails type={type} />
  );
};

export default AdultCreditPage;
