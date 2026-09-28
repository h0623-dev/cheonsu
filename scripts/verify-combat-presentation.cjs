// Keep the established QA entry point while sharing the current duel fixture.
import('./verify-duel-basics.mjs').catch(error=>{console.error(error);process.exitCode=1;});
