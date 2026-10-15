import defineMessages from '@app/utils/defineMessages';

// RadarrModal's service-specific texts when it edits a Whisparr server
const whisparrMessages = defineMessages('components.Settings.WhisparrModal', {
  createwhisparr: 'Add New Whisparr Server',
  create4kwhisparr: 'Add New 4K Whisparr Server',
  editwhisparr: 'Edit Whisparr Server',
  edit4kwhisparr: 'Edit 4K Whisparr Server',
  toastWhisparrTestSuccess: 'Whisparr connection established successfully!',
  toastWhisparrTestFailure: 'Failed to connect to Whisparr.',
  apiKeyHelp: 'Find it in Whisparr: Settings > General > Security > API Key',
  baseUrlHelp:
    'If you set a URL Base in Whisparr (Settings > General > Host), enter it here (e.g. /whisparr). Leave blank otherwise.',
  syncEnabledHelp:
    'Scan Whisparr for existing media and request status so users cannot request content already available.',
  enableSearchHelp:
    'Automatically trigger a search in Whisparr when a request is approved.',
});

export default whisparrMessages;
