"""Teams, team members and team leads (docs/API.md §"Teams").

Covers the team invariants the tenancy matrix cannot express on its own:

- a lead must be a member of their team, and creating a team with a lead
  auto-adds that lead (documented decision);
- every id in a body must be a membership of the url's org (cross-org → 404
  and nothing written);
- replacing the member set removes the lead link when the lead is dropped, in
  one locked transaction that also survives two concurrent replacements;
- a duplicate name is a 409, deleting a team with plans is a 409;
- list/get visibility per role and a user belonging to two teams.
"""

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from faker import Faker
from sqlalchemy import func, select

from app.models import Membership, Organization, Plan, Team, TeamMember, User
from app.security import generate_jwt_token, hash_password

fake = Faker()


def _token(user) -> str:
    return generate_jwt_token({"sub": str(user.id)}, audience="app")


def _auth(token: str) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token}"}


def _monday() -> date:
    today = datetime.now(UTC).date()
    return today - timedelta(days=today.weekday())


async def _make_user(db) -> User:
    user = User(
        first_name=fake.first_name(),
        last_name=fake.last_name(),
        email=fake.email().lower(),
        password=hash_password("x"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_org(db, *role_specs: str):
    """Seed an org with one user per role entry; returns ``(org, members)``."""
    org = Organization(name=fake.company(), slug=f"tm-{uuid.uuid4().hex[:12]}")
    db.add(org)
    await db.flush()
    members = []
    for role in role_specs:
        user = await _make_user(db)
        membership = Membership(org_id=org.id, user_id=user.id, role=role)
        db.add(membership)
        await db.flush()
        members.append((role, user, membership))
    return org, members


def _pick(members, role: str, index: int = 0):
    return [entry for entry in members if entry[0] == role][index]


async def _team_member_ids(session, team_id) -> set:
    rows = await session.execute(
        select(TeamMember.membership_id).where(TeamMember.team_id == team_id)
    )
    return {row[0] for row in rows.all()}


@pytest.mark.asyncio
async def test_admin_creates_team_without_lead(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, admin_user, _ = _pick(members, "admin")
        org_id = org.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/teams",
        json={"name": "Platform"},
        headers=_auth(_token(admin_user)),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Platform"
    assert data["lead_membership_id"] is None
    assert data["member_count"] == 0

    async with session_factory() as db:
        team = await db.get(Team, uuid.UUID(data["id"]))
        assert team is not None and team.lead_membership_id is None


@pytest.mark.asyncio
async def test_creating_team_with_lead_auto_adds_lead_as_member(
    async_client, session_factory
):
    """A lead must be a team member, so creating with a lead adds them."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, _, lead_membership = _pick(members, "member")
        org_id = org.id
        lead_id = lead_membership.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/teams",
        json={"name": "Product", "lead_membership_id": str(lead_id)},
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["lead_membership_id"] == str(lead_id)
    assert data["member_count"] == 1

    async with session_factory() as db:
        assert await _team_member_ids(db, uuid.UUID(data["id"])) == {lead_id}


@pytest.mark.asyncio
async def test_cross_org_lead_is_404_and_writes_no_team(async_client, session_factory):
    """A ``lead_membership_id`` from another org → 404, and no team is written."""
    async with session_factory() as db:
        org_a, members_a = await _seed_org(db, "owner")
        _, owner_a_user, _ = _pick(members_a, "owner")
        _org_b, members_b = await _seed_org(db, "owner", "member")
        _, _, foreign_membership = _pick(members_b, "member")
        org_a_id = org_a.id
        foreign_id = foreign_membership.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_a_id}/teams",
        json={"name": "Cross", "lead_membership_id": str(foreign_id)},
        headers=_auth(_token(owner_a_user)),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"

    async with session_factory() as db:
        count = (
            await db.execute(
                select(func.count()).select_from(Team).where(Team.org_id == org_a_id)
            )
        ).scalar()
        assert count == 0


@pytest.mark.asyncio
async def test_set_lead_requires_team_member(async_client, session_factory):
    """A membership of the org that is not on the team → 422 validation_error."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, _, outsider_membership = _pick(members, "member")
        team = Team(org_id=org.id, name="Data")
        db.add(team)
        await db.flush()
        org_id, team_id = org.id, team.id
        outsider_id = outsider_membership.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_id}/teams/{team_id}/lead",
        json={"membership_id": str(outsider_id)},
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"

    async with session_factory() as db:
        team = await db.get(Team, team_id)
        assert team.lead_membership_id is None


@pytest.mark.asyncio
async def test_replace_members_with_cross_org_id_is_404_and_unchanged(
    async_client, session_factory
):
    """Any membership id outside the org → 404, and the set is unchanged."""
    async with session_factory() as db:
        org_a, members_a = await _seed_org(db, "owner", "member")
        _, owner_a_user, _ = _pick(members_a, "owner")
        _, _, member_a_membership = _pick(members_a, "member")
        _org_b, members_b = await _seed_org(db, "owner", "member")
        _, _, foreign_membership = _pick(members_b, "member")

        team = Team(org_id=org_a.id, name="Data")
        db.add(team)
        await db.flush()
        db.add(
            TeamMember(
                org_id=org_a.id,
                team_id=team.id,
                membership_id=member_a_membership.id,
            )
        )
        await db.flush()
        org_a_id, team_id = org_a.id, team.id
        member_a_id = member_a_membership.id
        foreign_id = foreign_membership.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_a_id}/teams/{team_id}/members",
        json={"membership_ids": [str(member_a_id), str(foreign_id)]},
        headers=_auth(_token(owner_a_user)),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"

    async with session_factory() as db:
        assert await _team_member_ids(db, team_id) == {member_a_id}


@pytest.mark.asyncio
async def test_replace_members_removing_lead_clears_lead(async_client, session_factory):
    """Replacing the set without the lead clears ``lead_membership_id``."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, _, lead_membership = _pick(members, "member", 0)
        _, _, other_membership = _pick(members, "member", 1)
        team = Team(org_id=org.id, name="Data", lead_membership_id=lead_membership.id)
        db.add(team)
        await db.flush()
        for membership in (lead_membership, other_membership):
            db.add(
                TeamMember(org_id=org.id, team_id=team.id, membership_id=membership.id)
            )
        await db.flush()
        org_id, team_id = org.id, team.id
        other_id = other_membership.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_id}/teams/{team_id}/members",
        json={"membership_ids": [str(other_id)]},
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 200, response.text
    assert response.json()["lead_membership_id"] is None

    async with session_factory() as db:
        team = await db.get(Team, team_id)
        assert team.lead_membership_id is None
        assert await _team_member_ids(db, team_id) == {other_id}


@pytest.mark.asyncio
async def test_concurrent_member_replacements_leave_no_dangling_lead(
    async_client, session_factory
):
    """Two concurrent replacements serialize on the team row lock (rule 40)."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, _, lead_membership = _pick(members, "member", 0)
        _, _, other_membership = _pick(members, "member", 1)
        team = Team(org_id=org.id, name="Data", lead_membership_id=lead_membership.id)
        db.add(team)
        await db.flush()
        for membership in (lead_membership, other_membership):
            db.add(
                TeamMember(org_id=org.id, team_id=team.id, membership_id=membership.id)
            )
        await db.flush()
        org_id, team_id = org.id, team.id
        lead_id, other_id = lead_membership.id, other_membership.id
        await db.commit()

    headers = _auth(_token(owner_user))
    url = f"/app/orgs/{org_id}/teams/{team_id}/members"
    responses = await asyncio.gather(
        async_client.put(
            url, json={"membership_ids": [str(other_id)]}, headers=headers
        ),
        async_client.put(
            url,
            json={"membership_ids": [str(lead_id), str(other_id)]},
            headers=headers,
        ),
    )
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]

    async with session_factory() as db:
        team = await db.get(Team, team_id)
        member_ids = await _team_member_ids(db, team_id)
        assert member_ids in ({other_id}, {lead_id, other_id})
        # No dangling lead: it is either cleared or still a member.
        assert team.lead_membership_id is None or team.lead_membership_id in member_ids


@pytest.mark.asyncio
async def test_duplicate_team_name_is_409(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, _ = _pick(members, "owner")
        db.add(Team(org_id=org.id, name="Platform"))
        org_id = org.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/teams",
        json={"name": "Platform"},
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


@pytest.mark.asyncio
async def test_delete_team_with_plans_is_409_then_204_without(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, owner_membership = _pick(members, "owner")
        team = Team(org_id=org.id, name="Platform")
        db.add(team)
        await db.flush()
        db.add(
            Plan(
                org_id=org.id,
                membership_id=owner_membership.id,
                team_id=team.id,
                week_start=_monday(),
            )
        )
        await db.flush()
        org_id, team_id = org.id, team.id
        await db.commit()

    headers = _auth(_token(owner_user))
    blocked = await async_client.delete(
        f"/app/orgs/{org_id}/teams/{team_id}", headers=headers
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "conflict"

    async with session_factory() as db:
        plan = (
            (await db.execute(select(Plan).where(Plan.team_id == team_id)))
            .scalars()
            .one()
        )
        await db.delete(plan)
        await db.commit()

    deleted = await async_client.delete(
        f"/app/orgs/{org_id}/teams/{team_id}", headers=headers
    )
    assert deleted.status_code == 204
    async with session_factory() as db:
        assert await db.get(Team, team_id) is None


@pytest.mark.asyncio
async def test_list_visibility_by_role(async_client, session_factory):
    """Admins see every team; a plain member only the teams they belong to."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, admin_user, _ = _pick(members, "admin")
        _, member_user, member_membership = _pick(members, "member")

        mine = Team(org_id=org.id, name="Mine")
        theirs = Team(org_id=org.id, name="Theirs")
        db.add_all([mine, theirs])
        await db.flush()
        db.add(
            TeamMember(
                org_id=org.id,
                team_id=mine.id,
                membership_id=member_membership.id,
            )
        )
        org_id = org.id
        await db.commit()

    as_admin = await async_client.get(
        f"/app/orgs/{org_id}/teams", headers=_auth(_token(admin_user))
    )
    assert as_admin.status_code == 200
    assert as_admin.json()["total"] == 2

    as_member = await async_client.get(
        f"/app/orgs/{org_id}/teams", headers=_auth(_token(member_user))
    )
    assert as_member.status_code == 200
    assert [item["name"] for item in as_member.json()["items"]] == ["Mine"]


@pytest.mark.asyncio
async def test_outsider_team_member_and_admin_read_access(
    async_client, session_factory
):
    """404 for a non-member, 200 for a teammate, 200 for an admin."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, admin_user, _ = _pick(members, "owner")
        _, outsider_user, _ = _pick(members, "member", 0)
        _, teammate_user, teammate_membership = _pick(members, "member", 1)
        team = Team(org_id=org.id, name="Data")
        db.add(team)
        await db.flush()
        db.add(
            TeamMember(
                org_id=org.id,
                team_id=team.id,
                membership_id=teammate_membership.id,
            )
        )
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/teams/{team_id}"
    assert (
        await async_client.get(url, headers=_auth(_token(outsider_user)))
    ).status_code == 404
    assert (
        await async_client.get(url, headers=_auth(_token(teammate_user)))
    ).status_code == 200
    assert (
        await async_client.get(url, headers=_auth(_token(admin_user)))
    ).status_code == 200


@pytest.mark.asyncio
async def test_team_member_without_admin_cannot_write(async_client, session_factory):
    """A plain member of the team can read it but not edit it (403)."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, _, member_membership = _pick(members, "member")
        _, member_user, _ = _pick(members, "member")
        team = Team(org_id=org.id, name="Data")
        db.add(team)
        await db.flush()
        db.add(
            TeamMember(
                org_id=org.id,
                team_id=team.id,
                membership_id=member_membership.id,
            )
        )
        org_id, team_id = org.id, team.id
        await db.commit()

    response = await async_client.patch(
        f"/app/orgs/{org_id}/teams/{team_id}",
        json={"name": "Hacked"},
        headers=_auth(_token(member_user)),
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


@pytest.mark.asyncio
async def test_user_can_belong_to_two_teams(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, member_user, member_membership = _pick(members, "member")
        first = Team(org_id=org.id, name="Platform")
        second = Team(org_id=org.id, name="Product")
        db.add_all([first, second])
        await db.flush()
        for team in (first, second):
            db.add(
                TeamMember(
                    org_id=org.id,
                    team_id=team.id,
                    membership_id=member_membership.id,
                )
            )
        org_id = org.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/teams", headers=_auth(_token(member_user))
    )
    assert response.status_code == 200
    assert {item["name"] for item in response.json()["items"]} == {
        "Platform",
        "Product",
    }
    # Adding the same membership again to a team is idempotent at the service
    # layer: the set is replaced, never duplicated.
    team_id = response.json()["items"][0]["id"]
    replace = await async_client.put(
        f"/app/orgs/{org_id}/teams/{team_id}/members",
        json={"membership_ids": [str(member_membership.id), str(member_membership.id)]},
        headers=_auth(_token(owner_user)),
    )
    assert replace.status_code == 200
    assert replace.json()["member_count"] == 1
