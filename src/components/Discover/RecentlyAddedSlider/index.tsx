import Slider from '@app/components/Slider';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import useAdult from '@app/hooks/useAdult';
import { Permission, useUser } from '@app/hooks/useUser';
import { adultMediaId } from '@app/utils/adultMedia';
import defineMessages from '@app/utils/defineMessages';
import type Media from '@server/entity/Media';
import type { MediaResultsResponse } from '@server/interfaces/api/mediaInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.RecentlyAddedSlider', {
  recentlyAdded: 'Recently Added',
  recentlyAddedScenes: 'Recently Added Scenes',
});

const RECENT_URL = '/api/v1/media?filter=allavailable&take=20&sort=mediaAdded';

interface RecentRowProps {
  sliderKey: string;
  title: string;
  url: string;
}

const RecentRow = ({ sliderKey, title, url }: RecentRowProps) => {
  const { data: media, error } = useSWR<MediaResultsResponse>(url, {
    revalidateOnMount: true,
  });

  if (media && !media.results.length && !error) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <div className="slider-title">
          <span>{title}</span>
        </div>
      </div>
      <Slider
        sliderKey={sliderKey}
        isLoading={!media}
        items={(media?.results ?? []).map((item: Media) => (
          <TmdbTitleCard
            key={`media-slider-item-${item.id}`}
            id={item.id}
            tmdbId={item.tmdbId}
            tvdbId={item.tvdbId}
            externalId={adultMediaId(item)}
            type={item.mediaType}
          />
        ))}
      />
    </>
  );
};

// Scenes get a row of their own: their landscape cards don't mix with posters
const RecentlyAddedSlider = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const canViewAdult = useAdult();

  if (
    !hasPermission([Permission.MANAGE_REQUESTS, Permission.RECENT_VIEW], {
      type: 'or',
    })
  ) {
    return null;
  }

  return (
    <>
      <RecentRow
        sliderKey="media"
        title={intl.formatMessage(messages.recentlyAdded)}
        url={`${RECENT_URL}&mediaType=movie%2Ctv%2Cadultmovie`}
      />
      {canViewAdult && (
        <RecentRow
          sliderKey="media-scenes"
          title={intl.formatMessage(messages.recentlyAddedScenes)}
          url={`${RECENT_URL}&mediaType=scene`}
        />
      )}
    </>
  );
};

export default RecentlyAddedSlider;
