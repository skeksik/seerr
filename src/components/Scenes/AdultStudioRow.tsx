import { creditHref } from '@app/components/Common/adultRoutes';
import SliderHeader from '@app/components/Common/SliderHeader';
import CompanyCard from '@app/components/CompanyCard';
import SeeAllStudiosCard from '@app/components/Scenes/SeeAllStudiosCard';
import Slider from '@app/components/Slider';
import { stashImageUrl } from '@app/utils/stashImage';

interface AdultStudioRowProps {
  sliderKey: string;
  title: string;
  // Every studio of the row, also behind its last card
  linkUrl: string;
  // StashDB studios or ThePornDB sites, for their images
  mediaType: 'scene' | 'adultmovie';
  // Until they load. Sites linked to a StashDB studio open its page
  studios?: {
    id: string | number;
    name: string;
    imageUrl?: string;
    stashDbId?: string;
  }[];
}

// The studio row of the Discover page, for StashDB and ThePornDB studios
const AdultStudioRow = ({
  sliderKey,
  title,
  linkUrl,
  mediaType,
  studios,
}: AdultStudioRowProps) => (
  <>
    <SliderHeader title={title} linkUrl={linkUrl} />
    <Slider
      sliderKey={sliderKey}
      isLoading={!studios}
      isEmpty={false}
      items={[
        ...(studios ?? []).map((studio) => (
          <CompanyCard
            key={`${sliderKey}-${studio.id}`}
            name={studio.name}
            image={
              mediaType === 'scene'
                ? stashImageUrl(studio.imageUrl, 300)
                : studio.imageUrl
            }
            imageType={mediaType === 'scene' ? 'stashdb' : 'tpdb'}
            url={creditHref('studio', studio.stashDbId ?? studio.id)}
          />
        )),
        <SeeAllStudiosCard key={`${sliderKey}-all`} url={linkUrl} />,
      ]}
    />
  </>
);

export default AdultStudioRow;
