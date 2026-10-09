// Shared with Next config: production builds cannot compile the local mocks.
export function localFixtureRuntime(env = process.env) {
    return env.NODE_ENV === 'development' && env.CREATOR_DASHBOARD_ENABLED === 'true' && env.CREATOR_DASHBOARD_FIXTURES === 'true';
}
