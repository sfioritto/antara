import { step, action, reduce } from 'positronic';
import { Octokit } from '@octokit/rest';
import { config } from 'dotenv';

config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const REPO_OWNER = process.env.REPO_OWNER as string;
const REPO_NAME = process.env.REPO_NAME as string;

export { REPO_OWNER, REPO_NAME };

if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    throw new Error('Required environment variables are not set');
}

// Create a custom Octokit instance
// I'm not using defaults because TS throws errors when
// I call octokit functions without providing the owner and repo
// even though the Octokit instance is created with them as defaults.
// I opted to just pass them in as arguments to the functions over and
// over.
export const octokit: Octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

export const getContent = async (filePath: string) => {
  try {
    const response = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: filePath,
    });

    const content = Buffer.from((response.data as any).content, 'base64').toString();
    return content;
  } catch (error) {
    throw new Error(`Failed to fetch file content: ${error}`);
  }
}

export const file = (name: string, path: string) => {
  return step(`Get file content from github for ${path}`,
    action(async () => {
      const content = await getContent(path);
      return content;
    }),
    reduce((fileContent, context: Record<string, any>) => (
      { ...context, [name]: fileContent }
    ))
  )
}

type BranchNameArg<ContextShape> = string | ((context: ContextShape) => string);

export function createBranch<ContextShape>(
  branchName: BranchNameArg<ContextShape>,
  baseBranchName: BranchNameArg<ContextShape> = 'develop'
) {
  return step(
    'Create git branch',
    action(async (context: ContextShape) => {
      const targetBranch = typeof branchName === 'function' ? branchName(context) : branchName;
      const baseBranch = typeof baseBranchName === 'function' ? baseBranchName(context) : baseBranchName;

      try {
        const response = await octokit.rest.git.getRef({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          ref: `heads/${baseBranch}`
        });

        const baseSha = response.data.object.sha;

        try {
          await octokit.rest.git.createRef({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            ref: `refs/heads/${targetBranch}`,
            sha: baseSha
          });
        } catch (error: any) {
          // If branch already exists, that's fine
          if (error.status !== 422) {
            throw error;
          }
        }

        return targetBranch;
      } catch (error) {
        throw new Error(`Failed to create branch: ${error}`);
      }
    }),
    reduce((branchName: string, context: ContextShape) => ({ ...context, branchName }))
  );
 }


