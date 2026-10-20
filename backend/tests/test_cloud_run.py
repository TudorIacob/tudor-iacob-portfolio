import pytest
from app.core.config import Settings
from app.main import create_app


def test_cloud_run_rejects_demo_startup(monkeypatch):
    monkeypatch.setenv('K_SERVICE', 'tai-backend')
    with pytest.raises(ValueError, match='Cloud Run requires MODE=live'):
        create_app(Settings(_env_file=None, mode='demo'))


def test_local_demo_still_supported(monkeypatch):
    monkeypatch.delenv('K_SERVICE', raising=False)
    assert create_app(Settings(_env_file=None, mode='demo'))
