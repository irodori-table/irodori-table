use super::parser::{parse_branch_header, parse_status_line};
use super::*;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

struct TestRepo {
    path: PathBuf,
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn test_dir_path(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "irodori-git-{name}-{}-{suffix}",
        std::process::id()
    ))
}

fn test_dir(name: &str) -> TestRepo {
    let path = test_dir_path(name);
    fs::create_dir_all(&path).expect("create test dir");
    TestRepo { path }
}

fn test_repo(name: &str) -> TestRepo {
    let repo = test_dir(name);
    let output = Command::new("git")
        .arg("init")
        .current_dir(&repo.path)
        .output()
        .expect("run git init");
    assert!(
        output.status.success(),
        "git init failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    repo
}

// Resolves a path the user picked, with no dev fallbacks, as a release build does.
fn resolve_chosen(path: &Path) -> IrodoriResult<PathBuf> {
    resolve_repo_root_with_fallbacks(Some(path_to_string(path).as_str()), &[])
}

fn error_code(result: IrodoriResult<PathBuf>) -> Option<String> {
    result.expect_err("expected an error").code
}

#[test]
fn parses_branch_header_with_upstream_counts() {
    let (branch, upstream, ahead, behind) =
        parse_branch_header("main...origin/main [ahead 2, behind 1]");
    assert_eq!(branch, "main");
    assert_eq!(upstream.as_deref(), Some("origin/main"));
    assert_eq!(ahead, 2);
    assert_eq!(behind, 1);
}

#[test]
fn parses_branch_lines_with_tracking_counts() {
    let branch = parse_branch_line("feature\x1f*\x1forigin/feature\x1f[ahead 3]").unwrap();
    assert_eq!(branch.name, "feature");
    assert!(branch.current);
    assert_eq!(branch.upstream.as_deref(), Some("origin/feature"));
    assert_eq!(branch.ahead, 3);
    assert_eq!(branch.behind, 0);
}

#[test]
fn detects_remote_providers_and_web_urls() {
    let remotes = parse_remotes(
        "\
origin\tgit@github.com:irodori-table/irodori-table.git (fetch)
origin\tgit@github.com:irodori-table/irodori-table.git (push)
gitlab\thttps://gitlab.com/group/project.git (fetch)
bb\tgit@bitbucket.org:team/repo.git (fetch)
azure\tgit@ssh.dev.azure.com:v3/org/project/repo (fetch)
aws\tssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/my-repo (fetch)",
    );
    assert_eq!(remotes[0].provider, GitRemoteProvider::Github);
    assert_eq!(
        remotes[0].web_url.as_deref(),
        Some("https://github.com/irodori-table/irodori-table")
    );
    assert_eq!(remotes[1].provider, GitRemoteProvider::Gitlab);
    assert_eq!(remotes[2].provider, GitRemoteProvider::Bitbucket);
    assert_eq!(remotes[3].provider, GitRemoteProvider::AzureRepos);
    assert_eq!(
        remotes[3].web_url.as_deref(),
        Some("https://dev.azure.com/org/project/_git/repo")
    );
    assert_eq!(remotes[4].provider, GitRemoteProvider::CodeCommit);
    assert_eq!(
            remotes[4].web_url.as_deref(),
            Some("https://us-east-1.console.aws.amazon.com/codesuite/codecommit/repositories/my-repo/browse?region=us-east-1")
        );
}

#[test]
fn parses_porcelain_status_lines() {
    let file = parse_status_line(" M apps/desktop/src/App.tsx").unwrap();
    assert_eq!(file.path, "apps/desktop/src/App.tsx");
    assert!(matches!(file.kind, GitChangeKind::Modified));

    let rename = parse_status_line("R  old.sql -> new.sql").unwrap();
    assert_eq!(rename.path, "new.sql");
    assert_eq!(rename.original_path.as_deref(), Some("old.sql"));
    assert!(matches!(rename.kind, GitChangeKind::Renamed));
}

#[test]
fn parses_commit_line_with_parents_and_refs() {
    let commit = parse_commit_line(
            "abcd1234\x1fabcd123\x1fHiro\x1f1761300000\x1fMerge branch feature\x1fparent1 parent2\x1fHEAD -> main, tag: v1.0.0, origin/main",
        )
        .unwrap();
    assert_eq!(commit.hash, "abcd1234");
    assert_eq!(commit.short_hash, "abcd123");
    assert_eq!(commit.parents, vec!["parent1", "parent2"]);
    assert_eq!(
        commit.refs,
        vec!["HEAD -> main", "tag: v1.0.0", "origin/main"]
    );
}

#[test]
fn discards_untracked_directories() {
    let repo = test_repo("discard-untracked-dir");
    let nested_file = repo.path.join("generated").join("snapshot.json");
    fs::create_dir_all(nested_file.parent().unwrap()).expect("create nested dir");
    fs::write(&nested_file, "{}").expect("write untracked file");

    git_discard_files(
        Some(path_to_string(&repo.path)),
        vec!["generated".to_string()],
    )
    .expect("discard untracked directory");

    assert!(
        !repo.path.join("generated").exists(),
        "untracked directory should be removed"
    );
}

// A shipped binary has no fallbacks, so with no path chosen it must report
// "unconfigured" rather than failing on some other machine's directory.
#[test]
fn reports_unconfigured_when_no_repository_is_chosen() {
    assert_eq!(
        error_code(resolve_repo_root_with_fallbacks(None, &[])).as_deref(),
        Some(REPO_UNCONFIGURED_CODE)
    );
    assert_eq!(
        error_code(resolve_repo_root_with_fallbacks(Some("  "), &[])).as_deref(),
        Some(REPO_UNCONFIGURED_CODE)
    );
}

// The released app showed "cannot change to '/home/runner/work/...'": a
// fallback that does not exist on this machine must read as unconfigured.
#[test]
fn missing_fallback_reads_as_unconfigured() {
    let gone = test_dir_path("gone-fallback");
    assert_eq!(
        error_code(resolve_repo_root_with_fallbacks(None, &[gone])).as_deref(),
        Some(REPO_UNCONFIGURED_CODE)
    );
}

#[test]
fn compile_time_checkout_is_only_a_debug_fallback() {
    let checkout = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    if cfg!(debug_assertions) {
        assert!(dev_fallback_roots().contains(&checkout));
    } else {
        assert!(dev_fallback_roots().is_empty());
    }
}

#[test]
fn reports_missing_folder_for_a_chosen_path_that_does_not_exist() {
    let gone = test_dir_path("gone-chosen");
    assert_eq!(
        error_code(resolve_chosen(&gone)).as_deref(),
        Some(REPO_MISSING_CODE)
    );
}

#[test]
fn reports_not_a_repository_for_a_plain_folder() {
    let dir = test_dir("plain-folder");
    assert_eq!(
        error_code(resolve_chosen(&dir.path)).as_deref(),
        Some(REPO_NOT_REPOSITORY_CODE)
    );
}

#[test]
fn resolves_a_chosen_repository() {
    let repo = test_repo("chosen");
    let root = resolve_chosen(&repo.path).expect("chosen repository resolves");
    assert_eq!(
        root.canonicalize().unwrap(),
        repo.path.canonicalize().unwrap()
    );
}

#[test]
fn initializes_a_repository_in_a_plain_folder() {
    let dir = test_dir("init-plain");
    git_init(path_to_string(&dir.path)).expect("git init succeeds");
    resolve_chosen(&dir.path).expect("initialized folder resolves as a repository");
}

#[test]
fn refuses_to_initialize_inside_an_existing_repository() {
    let repo = test_repo("init-nested");
    let nested = repo.path.join("nested");
    fs::create_dir_all(&nested).expect("create nested dir");

    git_init(path_to_string(&nested)).expect_err("nested init is refused");
    assert!(!nested.join(".git").exists());
}

#[test]
fn refuses_to_initialize_a_relative_or_missing_folder() {
    git_init("relative/folder".into()).expect_err("relative path is refused");
    let gone = test_dir_path("init-gone");
    git_init(path_to_string(&gone)).expect_err("missing folder is refused");
    assert!(!gone.exists(), "init must not create the folder");
}
