import pytest


@pytest.mark.asyncio
async def test_health_endpoint_healthy(async_client):
    """Test health endpoint returns healthy status when database is accessible."""
    response = await async_client.get("/app/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_internal_health_endpoint_healthy(async_client):
    """The internal surface carries its own health endpoint."""
    response = await async_client.get("/internal/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
