import AdultTitleList from '@app/components/AdultTitleList';
import type { NextPage } from 'next';

const AdultMovieSimilarPage: NextPage = () => {
  return <AdultTitleList mediaType="adultmovie" list="similar" />;
};

export default AdultMovieSimilarPage;
