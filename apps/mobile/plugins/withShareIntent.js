const { withMainActivity } = require('@expo/config-plugins');

// Only add onNewIntent + private helper — do NOT add a second onCreate
const METHODS = `
  override fun onNewIntent(intent: Intent?) {
    handleShareIntent(intent)
    super.onNewIntent(intent)
  }

  private fun handleShareIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
      val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
      val encoded = android.net.Uri.encode(sharedText)
      intent.data = android.net.Uri.parse("actionvault://add?sharedUrl=\$encoded")
      intent.action = Intent.ACTION_VIEW
      setIntent(intent)
    }
  }
`;

module.exports = function withShareIntent(config) {
  return withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add import if missing
    if (!contents.includes('import android.content.Intent')) {
      contents = contents.replace(/^(import .+)$/m, '$1\nimport android.content.Intent');
    }

    // Inject handleShareIntent(intent) into the EXISTING onCreate — before super.onCreate
    // This handles fresh app launches from share sheet
    if (!contents.includes('handleShareIntent')) {
      contents = contents.replace(
        /override fun onCreate\(savedInstanceState: Bundle\?\) \{/,
        'override fun onCreate(savedInstanceState: Bundle?) {\n    handleShareIntent(intent)'
      );
    }

    // Add onNewIntent + private helper before last brace (handles app-already-open case)
    if (!contents.includes('onNewIntent')) {
      contents = contents.replace(/}\s*$/, METHODS + '\n}');
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
