import SceneCreditDetails from '@app/components/Scenes/SceneCreditDetails';

interface AdultCreditPageProps {
  type: 'performer' | 'studio';
}

// /performer/[id] and /studio/[id]: StashDB's pages, by its UUIDs
const AdultCreditPage = ({ type }: AdultCreditPageProps) => (
  <SceneCreditDetails type={type} />
);

export default AdultCreditPage;
