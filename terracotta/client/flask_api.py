import os
from typing import Any
from flask import Flask, render_template, current_app, Blueprint, json, jsonify, send_file, request, Response


client_api = Blueprint('client_api', 'terracotta.client')


@client_api.route('/', methods=['GET'])
def get_map() -> Any:
    return render_template(
        'app.html', hostname=current_app.config['terracotta_hostname']
    )


@client_api.route('/getJsonFile/<jsonFile>', methods=['GET'])
def getBandNames(jsonFile):
    print(jsonFile)
    filename = os.path.join(current_app.static_folder, 'data', jsonFile + '.json')
    with open(filename) as json_file:
        data = json.load(json_file)

    return jsonify(data)


def create_app(hostname: str) -> Flask:
    client_app = Flask('terracotta.client')
    client_app.config['terracotta_hostname'] = hostname
    client_app.register_blueprint(client_api)
    return client_app
