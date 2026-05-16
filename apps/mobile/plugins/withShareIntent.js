const { withMainActivity } = require('@expo/config-plugins');

const METHODS = `
  override fun onNewIntent(intent: Intent?) {
    handleShareIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    handleShareIntent(intent)
    super.onCreate(savedInstanceState)
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
    if (!contents.includes('import android.content.Intent')) {
      contents = contents.replace(
        /^(import .+)$/m,
        '$1\nimport android.content.Intent'
      );
    }
    if (!contents.includes('handleShareIntent')) {
      contents = contents.replace(/}\s*$/, METHODS + '\n}');
    }
    mod.modResults.contents = contents;
    return mod;
  });
};
