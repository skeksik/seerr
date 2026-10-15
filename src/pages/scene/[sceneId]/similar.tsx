import AdultTitleList from '@app/components/AdultTitleList';
import type { NextPage } from 'next';

const SceneSimilarPage: NextPage = () => {
  return <AdultTitleList mediaType="scene" list="similar" />;
};

export default SceneSimilarPage;
