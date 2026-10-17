import { MediaType } from '@server/constants/media';
import { defineMessages } from '@server/i18n';

const globalMessages = defineMessages('notifications.common', {
  requestedBy: 'Requested By',
  requestStatus: 'Request Status',
  pendingApproval: 'Pending Approval',
  processing: 'Processing',
  available: 'Available',
  declined: 'Declined',
  failed: 'Failed',
  commentFrom: 'Comment from {userName}',
  reportedBy: 'Reported By',
  issueType: 'Issue Type',
  issueStatus: 'Issue Status',
  open: 'Open',
  resolved: 'Resolved',
  viewIssue: 'View Issue in {applicationTitle}',
  viewMedia: 'View Media in {applicationTitle}',
  openIn: 'Open in {applicationTitle}',
  movie: 'movie',
  series: 'series',
  scene: 'scene',
  adultMovie: 'Adult movie',
  issue: 'issue',
  issueTypeName: '{type} issue',
});

// The name of a media type in notification text
export const mediaTypeMessage = (mediaType: MediaType) =>
  ({
    [MediaType.MOVIE]: globalMessages.movie,
    [MediaType.TV]: globalMessages.series,
    [MediaType.SCENE]: globalMessages.scene,
    [MediaType.ADULT_MOVIE]: globalMessages.adultMovie,
  })[mediaType];

export default globalMessages;
