import os
from typing import Any
from flask import Flask, render_template, current_app, Blueprint, json


client_api = Blueprint('client_api', 'terracotta.client')


@client_api.route('/', methods=['GET'])
def get_map() -> Any:
    regions = getRegionHierarchy()
    return render_template(
        'app.html', hostname=current_app.config['terracotta_hostname'], regions=regions
    )


def getRegionHierarchy():
    filename = os.path.join(current_app.static_folder, 'data', 'regions.json')
    with open(filename) as region_file:
        data = json.load(region_file)

    return data


def create_app(hostname: str) -> Flask:
    client_app = Flask('terracotta.client')
    client_app.config['terracotta_hostname'] = hostname
    client_app.register_blueprint(client_api)
    return client_app
