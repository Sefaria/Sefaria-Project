const { IncomingWebhook } = require('@slack/webhook');
const { Octokit } = require("@octokit/action");
const octokit = new Octokit();

const githubURL = process.env.GITHUB_SERVER_URL;
const githubRepository = process.env.GITHUB_REPOSITORY;
const slackSuccessUrl = process.env.SLACK_TEST_SUCCESS_WEBHOOK_URL;
const slackFailureUrl = process.env.SLACK_TEST_FAILURE_WEBHOOK_URL;
const gitToSlackMap = JSON.parse(process.env.GITUSER_SLACK_MAP);  // map from git id to slack id
const runId = process.env.GITHUB_RUN_ID;
const githubSha = process.env.GITHUB_SHA;
const commitUrl = `${githubURL}${githubRepository}/commit/${githubSha}`;

const jobKeys = [
    "Jest",
    "PyTest",
    "Selenium: Local",
    "Selenium: Sauce",
];

(async function() {
    // Get the committer via the commit
    const commit = await octokit.request('GET /repos/{githubRepository}/commits/{githubSha}',
        {githubRepository, githubSha});
    const committerLogin = commit.data.committer.login;
    const slackName = gitToSlackMap[committerLogin];

    // Branch name
    const actionRun = await octokit.request('GET /repos/{githubRepository}/actions/runs/{runId}',
        {githubRepository, runId});
    const branch = actionRun.data.head_branch;
    /*
    May be able to get branch with:
    const branch =
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF.match(/(?<=refs\/heads\/).+/g)[0];
     */

    // Results of the jobs
    const actionJobs = await octokit.request('GET /repos/{githubRepository}/actions/runs/{runId}/jobs',
        {githubRepository, runId});

    const jobsResults = {};

    actionJobs.data.jobs.forEach(j => {
        if (jobKeys.includes(j.name)) {
            jobsResults[j.name] = {conclusion: j.conclusion, url: j.html_url};
        }
    });

    // conclusion will be: "success" or "failure"
    // Construct the slack message
    const succeeded = x => x && x.conclusion === "success";

    const badge = x => succeeded(x) ? ":large_green_circle:" : ":red_circle:";
    console.log(jobsResults);

    const commitMsg =`\`${branch}\` <${commitUrl}|${githubSha.slice(0,6)}> ${slackName?"@" + slackName:""}`;
    const testsMsg = jobKeys.filter(k=>jobsResults[k]).map(k => `${badge(jobsResults[k])} <${jobsResults[k].url}|${k}>`).join("     ");

    const slackMsg = {
        "blocks": [
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": commitMsg
                    }
                ]
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": testsMsg
                    }
                ]
            }
        ]
    };

    // Send the notification

    console.log(JSON.stringify(slackMsg));


    const overallSuccess = jobKeys.every(k => succeeded(jobsResults[k]));
    const webhookUrl = overallSuccess ? slackSuccessUrl : slackFailureUrl;
    const webhook = new IncomingWebhook(webhookUrl);

    try {
        await webhook.send(slackMsg);
    } catch(err) {
        console.log(err);
    }

}());



