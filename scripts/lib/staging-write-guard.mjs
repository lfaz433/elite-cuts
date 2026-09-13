const STAGING_PROJECT_ID = 'elite-cuts-staging';

export function requireStagingWrite(
  argv = process.argv.slice(2),
  env = process.env,
  label = 'Data mutation',
) {
  const projectIndex = argv.indexOf('--project');
  const target = projectIndex >= 0 ? argv[projectIndex + 1] : undefined;
  const apply = argv.includes('--apply');

  if (target && target !== 'staging' && target !== STAGING_PROJECT_ID) {
    throw new Error(`${label} is staging-only.`);
  }
  if (!apply) {
    console.log(`${label}: no-write preview only. Pass --project staging --apply with explicit confirmation to write.`);
    return false;
  }
  if (!target) throw new Error(`${label} requires --project staging.`);
  if (env.CONFIRM_STAGING_WRITE !== STAGING_PROJECT_ID) {
    throw new Error(`${label} requires CONFIRM_STAGING_WRITE=${STAGING_PROJECT_ID}.`);
  }
  return true;
}

export function requireStagingRead(argv = process.argv.slice(2), label = 'Diagnostic read') {
  const projectIndex = argv.indexOf('--project');
  const target = projectIndex >= 0 ? argv[projectIndex + 1] : undefined;
  if (target !== 'staging' && target !== STAGING_PROJECT_ID) {
    throw new Error(`${label} is staging-only and requires --project staging.`);
  }
}

export { STAGING_PROJECT_ID };
