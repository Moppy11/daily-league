// Features that are built but switched off. Turn one on by setting its variable to "on" in Vercel
// (Settings -> Environment Variables) and redeploying.

// The global table (/global): today's best and all-time bests for every game, from players with
// public stats. Off while the player base is small.
export const globalTableOn = () => process.env.ENABLE_GLOBAL_TABLE === 'on';
