# Contribute to `serverless-scaleway-functions`

## Topics

- [Contribute to `serverless-scaleway-functions`](#contribute-to-serverless-scaleway-functions)
  - [Topics](#topics)
  - [Reporting security issues](#reporting-security-issues)
  - [Reporting issues](#reporting-issues)
  - [Suggesting a feature](#suggesting-a-feature)
  - [Contributing code](#contributing-code)
    - [Submit code](#submit-code)
    - [Pull Request Guidelines](#pull-request-guidelines)
  - [Community Guidelines](#community-guidelines)

## Reporting security issues

At Scaleway we take security seriously. If you have any issues regarding security,
please notify us by sending an email to security@scaleway.com.

Please DO NOT create a GitHub issue.

We will follow up with you promptly with more information and a remediation plan.
We currently do not offer a paid security bounty program, but we would love to send some
Scaleway swag your way along with our deepest gratitude for your assistance in making
Scaleway a more secure Cloud ecosystem.

## Reporting issues

A great way to contribute to the project is to send a detailed report when you encounter a bug.
We always appreciate a well-written, thorough bug report, and will thank you for it!
Before opening a new issue, we appreciate you reviewing open issues to see if there are any similar requests.
If there is a match, thumbs up the issue with a 👍 and leave a comment if you have additional information.

When reporting an issue, please include the npm version number of `serverless-scaleway-functions` that you are using.

## Suggesting a feature

When requesting a feature, some of the questions we want to answer are:

- What value does this feature bring to end users?
- How urgent is the need (nice to have feature or need to have)?
- Does this align with the goals of this library?

## Contributing code

### Submit code

To submit code:

- Create a fork of the project
- Create a topic branch from where you want to base your work (usually main)
- Add tests to cover contributed code
- Push your commit(s) to your topic branch on your fork
- Open a pull request against `serverless-scaleway-functions` `main` branch that follows [PR guidelines](#pull-request-guidelines)

The maintainers of `serverless-scaleway-functions` use a "Let's Get This Merged" (LGTM) message in the pull request to note that the commits are ready to merge.
After one or more maintainer states LGTM, we will merge.
If you have questions or comments on your code, feel free to correct these in your branch through new commits.

### Pull Request Guidelines

The goal of the following guidelines is to have Pull Requests (PRs) that are fairly easy to review and comprehend, and code that is easy to maintain in the future.

- **Pull Request title should respect [conventional commits](https://www.conventionalcommits.org/en/v1.0.0) specifications** and be clear on what is being changed.

  - A fix for local testing will be titled `fix(local-testing): ...`
  - A fix for http requests will be titled `fix(http): ...`

- **Keep it readable for human reviewers** and prefer a subset of functionality (code) with tests and documentation over delivering them separately

- **Notify Work In Progress PRs** by prefixing the title with `[WIP]`
- **Please, keep us updated.**
  We will try our best to merge your PR, but please notice that PRs may be closed after 30 days of inactivity.

Your pull request should be rebased against the `main` branch.

Keep in mind only the **pull request title** will be used as the commit message as we stash all commits on merge.

## Community Guidelines

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Thank you for reading through all of this, if you have any questions feel free to [reach us](../README.md#reach-us)!
