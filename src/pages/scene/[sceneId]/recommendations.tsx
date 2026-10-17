import AdultTitleList from '@app/components/AdultTitleList';
import type { NextPage } from 'next';

const SceneRecommendationsPage: NextPage = () => {
  return <AdultTitleList mediaType="scene" list="recommendations" />;
};

export default SceneRecommendationsPage;
