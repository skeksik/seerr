import CachedImage from '@app/components/Common/CachedImage';

interface SiteIconProps {
  icon: string;
  className?: string;
}

// A site's StashDB icon; site icons are not adult artwork, so never blurred
const SiteIcon = ({ icon, className = 'h-5 w-5' }: SiteIconProps) => (
  <CachedImage
    type="stashdb"
    src={icon}
    alt=""
    width={20}
    height={20}
    adult={false}
    className={`flex-shrink-0 rounded-sm ${className}`}
  />
);

export default SiteIcon;
